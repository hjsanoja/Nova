/**
 * Integración cliente ↔ base de datos REAL: la cola (Outbox) del dispositivo ejecuta las RPC del DDL de producción
 * en PostgreSQL + PostGIS, y la descarga incremental (pull) lee las tablas con RLS como cualquier vendedor.
 * Verifica que los payloads de TypeScript y las funciones SQL hablan el mismo contrato.
 *
 * Se omite si no hay servidor: NOVA_PG=1 PGHOST=/tmp/pgsock PGPORT=5544 PGUSER=postgres npx vitest run
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generarArchivoDrogueria } from '../services/exportacionDrogueria';
import type { NovaDB } from './db';
import { procesarOutbox } from './outbox';
import { crearPedidoLocal, crearProspectoLocal, registrarVisitaLocal, reruteoLocal } from './pedidos';
import { calcularSugerido } from './sugerido';
import { traerTodo } from './pull';
import { ErrorRemoto } from './remoto';
import type { FilaRemota, SyncRemote } from './remoto';
import { crearDbTemporal } from './testing/utiles';
import type { TipoOutbox } from './types';

const activo = !!process.env.NOVA_PG;
const NOMBRE_DB = 'nova_it';

const U = {
  admin: 'a0000000-0000-4000-8000-000000000001',
  mesa: 'a0000000-0000-4000-8000-0000000000b1',
  vend: 'a0000000-0000-4000-8000-0000000000c1',
  vend2: 'a0000000-0000-4000-8000-0000000000c2',
};
const EQ = 'e0000000-0000-4000-8000-000000000001';
const DROG_A = 'd0000000-0000-4000-8000-00000000000a';
const DROG_B = 'd0000000-0000-4000-8000-00000000000b';
const CLI = 'c0000000-0000-4000-8000-000000000001';
const P = ['f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000003'];

let admin: pg.Client;

async function comoUsuario<T>(uid: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ database: NOMBRE_DB });
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query('SET LOCAL ROLE authenticated');
    await c.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [uid]);
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    await c.end();
  }
}

const TABLAS = new Set(['dim_productos', 'dim_droguerias', 'dim_clientes', 'map_producto_drogueria', 'map_cliente_drogueria', 'config_reglas_comerciales', 'fact_pedidos', 'fact_pedido_detalles', 'notificaciones', 'fact_compras_mensual']);
const COLUMNAS_FILTRO = new Set(['pedido_id']);
const COLUMNAS_MINIMO = new Set(['periodo']);

/** SyncRemote sobre PostgreSQL: mismas RPC que llamaría supabase-js, ejecutadas como un usuario autenticado (RLS activa). */
function remotoPostgres(uid: string): SyncRemote & { caido: boolean } {
  const remoto = {
    caido: false,
    async ejecutar(tipo: TipoOutbox, payload: Record<string, unknown>): Promise<FilaRemota> {
      if (remoto.caido) throw new ErrorRemoto('red', 'Failed to fetch');
      try {
        return await comoUsuario(uid, async (c) => {
          const r =
            tipo === 'pedido.rerutear'
              ? await c.query('SELECT rerutear_remanente($1::uuid,$2::uuid,$3::uuid) AS r', [payload.p_pedido, payload.p_drogueria_destino, payload.p_nuevo_id])
              : await c.query(`SELECT ${RPC[tipo]}($1::jsonb) AS r`, [JSON.stringify(payload)]);
          return r.rows[0].r as FilaRemota;
        });
      } catch (e) {
        const err = e as { code?: string; message: string };
        throw new ErrorRemoto('permanente', err.message, err.code);
      }
    },
    async traer(tabla: string, desde: string | null, limite: number, opciones: { creadoDesde?: string; filtro?: Record<string, string>; minimo?: Record<string, string> } = {}) {
      if (!TABLAS.has(tabla)) throw new Error(`tabla no permitida: ${tabla}`);
      return comoUsuario(uid, async (c) => {
        const params: unknown[] = [];
        const donde: string[] = ['1=1'];
        if (desde) (params.push(desde), donde.push(`t.updated_at > $${params.length}`));
        else if (opciones.creadoDesde) (params.push(opciones.creadoDesde), donde.push(`t.created_at >= $${params.length}`));
        for (const [col, v] of Object.entries(opciones.filtro ?? {})) {
          if (!COLUMNAS_FILTRO.has(col)) throw new Error('columna no permitida');
          params.push(v);
          donde.push(`t.${col} = $${params.length}`);
        }
        for (const [col, v] of Object.entries(opciones.minimo ?? {})) {
          if (!COLUMNAS_MINIMO.has(col)) throw new Error('columna no permitida');
          params.push(v);
          donde.push(`t.${col} >= $${params.length}`);
        }
        params.push(limite);
        const extra = '';
        // row_to_json imita a PostgREST: fechas ISO, numéricos como números, jsonb anidado.
        const r = await c.query(`SELECT row_to_json(x) AS f FROM (SELECT t.*${extra} FROM ${tabla} t WHERE ${donde.join(' AND ')} ORDER BY t.updated_at LIMIT $${params.length}) x`, params);
        return r.rows.map((row) => row.f as FilaRemota);
      });
    },
    async traerPorId() {
      return null;
    },
    async haySesion() {
      return true;
    },
  };
  return remoto;
}

const RPC: Record<Exclude<TipoOutbox, 'pedido.rerutear'>, string> = {
  'prospecto.crear': 'sync_crear_prospecto',
  'pedido.crear': 'sync_crear_pedido',
  'pedido.modificar': 'sync_modificar_pedido',
  'visita.registrar': 'sync_registrar_visita',
};

describe.skipIf(!activo)('integración con PostgreSQL + PostGIS', () => {
  let db: NovaDB;
  let remoto: ReturnType<typeof remotoPostgres>;
  const sesion = { vendedor_id: U.vend, equipo_id: EQ };

  beforeAll(async () => {
    const raiz = new pg.Client({ database: 'postgres' });
    await raiz.connect();
    await raiz.query(`DROP DATABASE IF EXISTS ${NOMBRE_DB}`);
    await raiz.query(`CREATE DATABASE ${NOMBRE_DB}`);
    await raiz.end();
    admin = new pg.Client({ database: NOMBRE_DB });
    await admin.connect();
    await admin.query(readFileSync('db-tests/00_stub_supabase.sql', 'utf8'));
    await admin.query(readFileSync('src/sql/nova_produccion_v3.sql', 'utf8'));
    await admin.query(`
      INSERT INTO auth.users (id, email) VALUES ('${U.admin}','a@t'),('${U.mesa}','m@t'),('${U.vend}','v@t'),('${U.vend2}','v2@t');
      INSERT INTO dim_equipos (id, codigo, nombre) VALUES ('${EQ}','ETICO','Ético');
      INSERT INTO dim_usuarios (id, nombre_completo, email, rol, equipo_id) VALUES
        ('${U.admin}','Admin','a@t','admin',NULL),('${U.mesa}','Mesa','m@t','transferencista',NULL),
        ('${U.vend}','Vendedor','v@t','vendedor','${EQ}'),('${U.vend2}','Vendedor 2','v2@t','vendedor','${EQ}')
        ON CONFLICT (id) DO UPDATE SET nombre_completo = excluded.nombre_completo, rol = excluded.rol, equipo_id = excluded.equipo_id, activo = true;
      INSERT INTO dim_droguerias (id, codigo, nombre, formato_export) VALUES
        ('${DROG_A}','COBECA','Cobeca', '{"formato":"csv","delimitador":";","encabezado":true,"entrecomillado":"solo_texto","salto_linea":"\\r\\n","codificacion":"utf-8","extension":"csv","decimal":"punto","formato_fecha":"YYYYMMDD","nombre_archivo":"{drogueria}_{correlativo}.{extension}","columnas":[{"encabezado":"CUENTA","origen":"codigo_cliente_drogueria"},{"encabezado":"CODIGO","origen":"codigo_producto_drogueria"},{"encabezado":"UDS","origen":"unidades_solicitadas"},{"encabezado":"PEDIDO","origen":"correlativo"}]}'),
        ('${DROG_B}','NENA','Nena', DEFAULT);
      INSERT INTO dim_productos (id, sku, ean13, nombre_comercial, categoria, empaque_minimo) VALUES
        ('${P[0]}','SKU-1','7590000000011','Losartán 50mg','cardio',10),
        ('${P[1]}','SKU-2','7590000000028','Atorvastatina 20mg','cardio',10),
        ('${P[2]}','SKU-3','7590000000035','Omeprazol 20mg','gastro',10);
      INSERT INTO dim_clientes (id, codigo_interno, razon_social, nombre_comercial, rif, rif_verificado, estado_validacion, ubicacion, frecuencia_dias)
        VALUES ('${CLI}','CLI-1001','Farmacia La Paz C.A.','La Paz','J-30489218-4',true,'activo', ST_SetSRID(ST_MakePoint(-66.85,10.5),4326)::geography, 7);
      INSERT INTO map_cliente_drogueria (drogueria_id, cliente_id, codigo_cuenta) VALUES ('${DROG_A}','${CLI}','COB-1001'),('${DROG_B}','${CLI}','NEN-77');
      INSERT INTO map_producto_drogueria (drogueria_id, producto_id, codigo_drogueria, descripcion_drogueria)
        SELECT '${DROG_A}', id, 'COB-' || sku, upper(nombre_comercial) FROM dim_productos;
      INSERT INTO rel_cliente_vendedor (cliente_id, vendedor_id, equipo_id) VALUES ('${CLI}','${U.vend}','${EQ}'),('${CLI}','${U.vend2}','${EQ}');
      INSERT INTO config_reglas_comerciales (nombre, alcance, descuento_max_pct) VALUES ('Base','linea',5);
      INSERT INTO config_reglas_comerciales (nombre, alcance, descuento_max_pct, min_skus_distintos) VALUES ('Mix 3','linea',12,3);
    `);
    db = crearDbTemporal();
    remoto = remotoPostgres(U.vend);
  });

  afterAll(async () => {
    await admin?.end();
  });

  it('la descarga incremental deja el dispositivo listo para trabajar sin red (respetando RLS)', async () => {
    const n = await traerTodo(db, remoto);
    expect(n).toBeGreaterThan(8);
    expect(await db.productos.count()).toBe(3);
    expect(await db.reglas.count()).toBe(2);
    expect(await db.mapProductos.count()).toBe(3);
    const cli = (await db.clientes.get(CLI))!;
    expect(cli).toMatchObject({ estado_validacion: 'activo', frecuencia_dias: 7, lat: 10.5, lon: -66.85 }); // lat/lon planas desde PostGIS
    expect((await db.droguerias.get(DROG_A))!.formato_export.columnas).toHaveLength(4);
    // Repetir la descarga es idempotente (el cursor solo re-pide un margen de 5 s).
    await traerTodo(db, remoto);
    expect(await db.productos.count()).toBe(3);
    expect(await db.mapProductos.count()).toBe(3);
  });

  it('pedido offline → cola → servidor asigna PED-1001 y adopta el estado oficial', async () => {
    const p = await crearPedidoLocal(db, { cliente_id: CLI, drogueria_id: DROG_A, enviar: true, lineas: [{ producto_id: P[0], unidades: 10, descuento_pct: 10 }, { producto_id: P[1], unidades: 8 }, { producto_id: P[2], unidades: 6 }] }, sesion);
    expect(p.estado).toBe('enviado_teletransferencia'); // validado localmente con las reglas cacheadas

    remoto.caido = true;
    expect((await procesarOutbox(db, remoto)).detenidoPor).toBe('red');
    expect((await db.pedidos.get(p.id))!.sync_estado).toBe('pendiente');
    remoto.caido = false;
    await db.outbox.toCollection().modify({ proximo_intento: 0 });
    expect(await procesarOutbox(db, remoto)).toMatchObject({ enviados: 1, errores: 0 });

    const local = (await db.pedidos.get(p.id))!;
    expect(local).toMatchObject({ correlativo: 'PED-1001', correlativo_provisional: false, estado: 'enviado_teletransferencia', sync_estado: 'sincronizado' });
    const { rows } = await admin.query('SELECT correlativo, estado, vendedor_id, folio_local, row_version FROM fact_pedidos WHERE id = $1', [p.id]);
    expect(rows[0]).toMatchObject({ correlativo: 'PED-1001', vendedor_id: U.vend, folio_local: p.folio_local });
    expect(local.row_version).toBe(rows[0].row_version); // la versión del servidor es la base de la concurrencia optimista
    expect((await admin.query('SELECT count(*)::int AS n FROM fact_pedido_detalles WHERE pedido_id = $1', [p.id])).rows[0].n).toBe(3);
  });

  it('la mesa despacha parcial → el vendedor recibe el aviso y re-rutea el remanente: PED-1001-R1', async () => {
    const { rows: [ped] } = await admin.query("SELECT id FROM fact_pedidos WHERE correlativo = 'PED-1001'");
    const { rows: dets } = await admin.query('SELECT id, linea FROM fact_pedido_detalles WHERE pedido_id = $1 ORDER BY linea', [ped.id]);
    await comoUsuario(U.mesa, async (c) => {
      await c.query('SELECT tomar_pedido($1)', [ped.id]);
      await c.query('SELECT confirmar_pedido($1::uuid, $2::jsonb, $3)', [ped.id, JSON.stringify([
        { detalle_id: dets[0].id, unidades_confirmadas: 10 },
        { detalle_id: dets[1].id, unidades_confirmadas: 3, motivo: 'quiebre_stock_drogueria' },
        { detalle_id: dets[2].id, unidades_confirmadas: 0, motivo: 'quiebre_stock_drogueria' },
      ]), 'FAC-1']);
    });

    // El vendedor descarga: ve el pedido parcial, las confirmaciones y la notificación.
    await traerTodo(db, remoto);
    expect((await db.pedidos.get(ped.id))!.estado).toBe('procesado_parcial');
    expect((await db.notificaciones.toArray())[0]).toMatchObject({ tipo: 'pedido_parcial', leida: false });
    const pendientes = (await db.detalles.where('pedido_id').equals(ped.id).toArray()).map((d) => d.unidades_pendientes).sort();
    expect(pendientes).toEqual([0, 5, 6]);

    // Un toque: nace el derivado en el dispositivo (provisional) y se envía en la cola.
    const hijo = await reruteoLocal(db, ped.id, DROG_B);
    expect(hijo).toMatchObject({ correlativo: 'PED-1001-R1', correlativo_provisional: true, estado: 'en_revision' });
    expect(await procesarOutbox(db, remoto)).toMatchObject({ enviados: 1, errores: 0 });

    const ack = (await db.pedidos.get(hijo.id))!;
    expect(ack).toMatchObject({ correlativo: 'PED-1001-R1', correlativo_provisional: false, sync_estado: 'sincronizado', parent_pedido_id: ped.id });
    const lineas = await db.detalles.where('pedido_id').equals(hijo.id).toArray();
    expect(lineas.map((l) => l.unidades_solicitadas).sort()).toEqual([5, 6]);
    const { rows: srv } = await admin.query('SELECT id FROM fact_pedido_detalles WHERE pedido_id = $1', [hijo.id]);
    expect(new Set(lineas.map((l) => l.id))).toEqual(new Set(srv.map((r) => r.id))); // ids del servidor, sin duplicados
    // Reintento con el mismo id: idempotente en el servidor.
    const otra = await remoto.ejecutar('pedido.rerutear', { p_pedido: ped.id, p_drogueria_destino: DROG_B, p_nuevo_id: hijo.id });
    expect(otra).toMatchObject({ ya_existia: true, correlativo: 'PED-1001-R1' });
  });

  it('exporta el derivado con los códigos de la droguería destino (y bloquea si falta la homologación)', async () => {
    const hijo = (await db.pedidos.filter((p) => p.correlativo === 'PED-1001-R1').first())!;
    const entrada = {
      pedido: hijo,
      detalles: await db.detalles.where('pedido_id').equals(hijo.id).toArray(),
      cliente: (await db.clientes.get(CLI))!,
      drogueria: (await db.droguerias.get(DROG_B))!,
      productos: await db.productos.toArray(),
      mapProductos: await db.mapProductos.toArray(),
      mapClientes: await db.mapClientes.toArray(),
    };
    // La droguería B tiene cuenta del cliente pero ningún producto homologado.
    const r = generarArchivoDrogueria(entrada);
    expect(r.ok).toBe(false);
    expect(r.errores.map((e) => e.codigo)).toEqual(['producto_sin_homologar', 'producto_sin_homologar']);
    // Con los códigos de la droguería A (mapeo completo) el archivo sale correcto.
    const ok = generarArchivoDrogueria({ ...entrada, drogueria: (await db.droguerias.get(DROG_A))!, mapClientes: [{ id: 'x', drogueria_id: DROG_A, cliente_id: CLI, codigo_cuenta: 'COB-1001' }] }, { ahora: new Date('2026-09-30T00:00:00') });
    expect(ok.ok).toBe(true);
    expect(ok.nombre_archivo).toBe('COBECA_PED-1001-R1.csv');
    expect(ok.texto.split('\r\n')).toEqual(['"CUENTA";"CODIGO";"UDS";"PEDIDO"', '"COB-1001";"COB-SKU-2";5;"PED-1001-R1"', '"COB-1001";"COB-SKU-3";6;"PED-1001-R1"', '']);
  });

  it('descuento fuera de rango: el dispositivo y el servidor coinciden en mandarlo a Revisión Especial', async () => {
    const p = await crearPedidoLocal(db, { cliente_id: CLI, drogueria_id: DROG_A, enviar: true, lineas: [{ producto_id: P[0], unidades: 4, descuento_pct: 10 }] }, sesion);
    expect(p).toMatchObject({ estado: 'en_revision', requiere_revision_especial: true });
    await procesarOutbox(db, remoto);
    const srv = (await admin.query('SELECT estado, requiere_revision_especial, motivos_revision FROM fact_pedidos WHERE id = $1', [p.id])).rows[0];
    expect(srv).toMatchObject({ estado: 'en_revision', requiere_revision_especial: true });
    expect(srv.motivos_revision[0]).toMatchObject({ tipo: 'descuento_linea_excedido', maximo: 5 });
    expect((await db.pedidos.get(p.id))!.motivos_revision[0]).toMatchObject({ tipo: 'descuento_linea_excedido', maximo: 5 });
  });

  it('prospecto de campo: queda pendiente, retiene sus pedidos y se libera cuando la mesa lo aprueba', async () => {
    const c = await crearProspectoLocal(db, { razon_social: 'Farmacia Nueva C.A.', rif: 'J-11111111-1', lat: 10.5, lon: -66.85 });
    const p = await crearPedidoLocal(db, { cliente_id: c.id, drogueria_id: DROG_A, enviar: true, lineas: [{ producto_id: P[0], unidades: 10 }] }, sesion);
    expect(p.estado).toBe('en_revision');
    expect(await procesarOutbox(db, remoto)).toMatchObject({ enviados: 2, errores: 0 }); // prospecto primero, luego el pedido
    expect((await admin.query('SELECT estado_validacion, creado_por FROM dim_clientes WHERE id = $1', [c.id])).rows[0]).toMatchObject({ estado_validacion: 'prospecto_pendiente', creado_por: U.vend });

    await comoUsuario(U.mesa, (cx) => cx.query('SELECT aprobar_prospecto($1,true,$2,$3,$4)', [c.id, DROG_A, 'COB-NEW', 'CLI-2000']));
    await traerTodo(db, remoto);
    expect((await db.clientes.get(c.id))).toMatchObject({ estado_validacion: 'activo', codigo_interno: 'CLI-2000' });
    expect((await db.pedidos.get(p.id))!.estado).toBe('enviado_teletransferencia');
  });

  it('check-in: el servidor calcula la distancia con PostGIS y el dispositivo la adopta', async () => {
    const v = await registrarVisitaLocal(db, { cliente_id: CLI, lat: 10.5003, lon: -66.85 }, sesion);
    await procesarOutbox(db, remoto);
    const local = (await db.visitas.get(v.id))!;
    expect(local.sync_estado).toBe('sincronizado');
    expect(local.dentro_de_radio).toBe(true);
    expect(local.distancia_metros).toBeGreaterThan(30);
    expect(local.distancia_metros).toBeLessThan(36);
  });

  it('un rechazo real del servidor (FK inexistente) deja la mutación en error sin bloquear las demás', async () => {
    const malo = await crearPedidoLocal(db, { cliente_id: CLI, drogueria_id: '00000000-0000-4000-8000-000000000000', enviar: true, lineas: [{ producto_id: P[0], unidades: 5 }] }, sesion);
    const bueno = await crearPedidoLocal(db, { cliente_id: CLI, drogueria_id: DROG_A, enviar: true, lineas: [{ producto_id: P[1], unidades: 5 }] }, sesion);
    const r = await procesarOutbox(db, remoto);
    expect(r).toMatchObject({ enviados: 1, errores: 1 });
    expect((await db.pedidos.get(malo.id))).toMatchObject({ sync_estado: 'error' });
    expect((await db.pedidos.get(bueno.id))!.sync_estado).toBe('sincronizado');
  });

  it('ventas reportadas por la droguería: se importan, se homologan por SUS códigos y bajan como consolidado que alimenta el sugerido', async () => {
    const CLI2 = 'c0000000-0000-4000-8000-000000000002';
    await admin.query(`
      INSERT INTO dim_clientes (id, codigo_interno, razon_social, nombre_comercial, rif, rif_verificado, estado_validacion, frecuencia_dias)
        VALUES ('${CLI2}','CLI-2002','Farmacia Sol C.A.','Sol','J-22222222-2',true,'activo',30);
      INSERT INTO rel_cliente_vendedor (cliente_id, vendedor_id, equipo_id) VALUES ('${CLI2}','${U.vend}','${EQ}');
      INSERT INTO map_cliente_drogueria (drogueria_id, cliente_id, codigo_cuenta, nombre_en_drogueria) VALUES ('${DROG_A}','${CLI2}','COB-2002','FARMACIA SOL');`);

    // Tres meses de compras (día 15 de cada mes, relativo a hoy) tal como las reporta Cobeca: sus códigos y sus nombres.
    const dia15 = (mesesAtras: number) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - mesesAtras, 15)).toISOString().slice(0, 10);
    const filas = [
      { n: 1, fecha: dia15(1), drogueria: 'cobeca', cod_cliente: 'COB-2002', nombre_cliente: 'FARMACIA SOL', cod_producto: 'COB-SKU-1', nombre_producto: 'LOSARTAN', unidades: 30 },
      { n: 2, fecha: dia15(1), drogueria: 'COBECA', cod_cliente: 'COB-2002', nombre_cliente: 'FARMACIA SOL', cod_producto: 'COB-SKU-2', nombre_producto: 'ATORVASTATINA', unidades: 10 },
      { n: 3, fecha: dia15(2), drogueria: 'COBECA', cod_cliente: 'COB-2002', nombre_cliente: 'FARMACIA SOL', cod_producto: 'COB-SKU-1', nombre_producto: 'LOSARTAN', unidades: 20 },
      { n: 4, fecha: dia15(3), drogueria: 'COBECA', cod_cliente: 'COB-2002', nombre_cliente: 'FARMACIA SOL', cod_producto: 'COB-SKU-1', nombre_producto: 'LOSARTAN', unidades: 10 },
      { n: 5, fecha: dia15(1), drogueria: 'COBECA', cod_cliente: 'COB-2002', nombre_cliente: 'FARMACIA SOL', cod_producto: 'COB-ZZZ', nombre_producto: 'PRODUCTO SIN HOMOLOGAR', unidades: 99 },
    ];
    const res = await comoUsuario(U.mesa, async (c) => (await c.query('SELECT importar_ventas_drogueria($1::jsonb, $2::jsonb) AS r', [JSON.stringify({ archivo: 'ventas.csv', checksum: 'it-1' }), JSON.stringify(filas)])).rows[0].r);
    expect(res).toMatchObject({ insertadas: 5, droguerias_desconocidas: [] });
    // Lo que no se pudo enlazar queda visible y NO llega al dispositivo del vendedor.
    expect((await admin.query('SELECT cod_producto_drogueria, unidades FROM vw_pendientes_productos')).rows).toEqual([{ cod_producto_drogueria: 'COB-ZZZ', unidades: 99 }]);

    await traerTodo(db, remoto);
    const compras = await db.comprasMensual.where('cliente_id').equals(CLI2).toArray();
    expect(compras).toHaveLength(4); // losartán x3 meses + atorvastatina x1
    expect(compras.find((c) => c.producto_id === P[1])).toMatchObject({ unidades: 10, n_compras: 1 });

    // Sin pedidos hechos en Nova, el sugerido sale del historial de la droguería: (30+20+10)/3 = 20 de losartán; 10/3 → 1 empaque de atorvastatina.
    const cli2 = (await db.clientes.get(CLI2))!;
    const ahora = new Date(new Date(dia15(1)).getTime() + 30 * 86_400_000); // 30 días tras la última compra = su frecuencia: factor 1
    const sugerido = await calcularSugerido(db, cli2, ahora);
    expect(sugerido.map((l) => [l.producto.id, l.unidades])).toEqual([[P[0], 20], [P[1], 10]]);

    // Reenviar el mismo archivo no duplica; homologar el código faltante lo enlaza solo y baja al dispositivo.
    const otra = await comoUsuario(U.mesa, async (c) => (await c.query('SELECT importar_ventas_drogueria($1::jsonb, $2::jsonb) AS r', [JSON.stringify({ archivo: 'ventas.csv', checksum: 'it-1' }), JSON.stringify(filas)])).rows[0].r);
    expect(otra.insertadas).toBe(0);
    await comoUsuario(U.mesa, (c) => c.query('SELECT homologar_producto($1,$2,$3,$4)', [DROG_A, P[2], 'COB-ZZZ', 'PRODUCTO SIN HOMOLOGAR']));
    await traerTodo(db, remoto);
    expect((await db.comprasMensual.where('cliente_id').equals(CLI2).toArray()).find((c) => c.producto_id === P[2])).toMatchObject({ unidades: 99 });
  });
});
