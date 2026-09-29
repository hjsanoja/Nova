import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { Cliente, Drogueria, HistoricoPedidoPrevio } from '../types/pharmacy';
import { FORMATO_CSV_POR_DEFECTO } from './storageMigrations';
import {
  cargarPerfilUsuario, checksumLote, clienteAV3, clienteDesdeV3, crearUsuarioNube, diasAFrecuencia, drogueriaAV3, equipoAV3, equipoDesdeV3,
  formatoExportALegado, formatoLegadoAExport, frecuenciaADias, fusionarPorClave, importarHomologacion, importarVentas, rolAV3, rolDesdeV3,
} from './nubeV3';

const cliente = (extra: Partial<Cliente> = {}): Cliente => ({
  id: 'CLI-1', ident01: 'CLI-1', codigo_cliente: 'CLI-1', rif: 'J-30489218-4', razon_social: 'La Paz C.A.', nombre_fantasia: 'La Paz',
  nombre_comercial: 'La Paz', brick: 'CCS-01', municipio_ciudad: 'Chacao', ciudad: 'Chacao', direccion: 'Calle 1', estado: 'Miranda',
  frecuencia: 'F2', bandera: 'Independiente', local_gps_lat: 10.5, local_gps_lon: -66.85, clasificacion_abc: 'B', cupo_credito: 0,
  dias_credito: 0, telefono: '0212', email_contacto: '', activo: true, created_at: '', ...extra,
});

describe('mapeos hacia y desde el modelo v3', () => {
  it('frecuencia de visita <-> días', () => {
    expect(['Semanal', 'F4', 'Quincenal', 'F2', 'Mensual', 'F1', '21', '', 'rara'].map(frecuenciaADias)).toEqual([7, 7, 15, 15, 30, 30, 21, null, null]);
    expect([7, 15, 30, 60, 21, null].map(diasAFrecuencia)).toEqual(['Semanal', 'Quincenal', 'Mensual', 'Bimestral', '21', 'Semanal']);
  });

  it('el layout CSV de la fase 1 se convierte con el vocabulario de v3 y "sku" pasa a ser el código de la droguería', () => {
    const f = formatoLegadoAExport(FORMATO_CSV_POR_DEFECTO);
    expect(f.columnas.map((c) => c.origen)).toEqual(['codigo_cliente_drogueria', 'rif_cliente', 'codigo_producto_drogueria', 'unidades_confirmadas', 'constante', 'correlativo']);
    expect(f).toMatchObject({ delimitador: ';', encabezado: true, entrecomillado: 'solo_texto', codificacion: 'utf-8', salto_linea: '\r\n', decimal: 'coma' });
    // La columna sin equivalente (descuento, sin precios en la fase 1) se conserva vacía para no mover el archivo.
    expect(f.columnas[4]).toEqual({ encabezado: 'DESCUENTO', origen: 'constante', valor: '' });
  });

  it('ida y vuelta del layout no pierde columnas, orden ni encabezados', () => {
    const vuelta = formatoExportALegado(formatoLegadoAExport({ ...FORMATO_CSV_POR_DEFECTO, delimitador: '|', codificacion: 'ISO-8859-1', incluir_encabezados: false }));
    expect(vuelta.columnas.map((c) => c.nombre_encabezado)).toEqual(FORMATO_CSV_POR_DEFECTO.columnas.map((c) => c.nombre_encabezado));
    expect(vuelta).toMatchObject({ delimitador: '|', codificacion: 'ISO-8859-1', incluir_encabezados: false });
    expect(vuelta.columnas.map((c) => c.campo_origen)).toEqual(['codigo_cliente', 'rif_cliente', 'sku', 'cantidad_confirmada', 'constante', 'numero_pedido']);
  });

  it('clienteAV3: no envía coordenadas inventadas ni RIF de relleno', () => {
    expect(clienteAV3(cliente())).toMatchObject({ codigo_interno: 'CLI-1', nombre_comercial: 'La Paz', municipio: 'Chacao', lat: 10.5, lon: -66.85, frecuencia_dias: 15 });
    const sinDatos = clienteAV3(cliente({ rif: 'J-00000000-0', local_gps_lat: 10.48, local_gps_lon: -66.86 }));
    expect(sinDatos).toMatchObject({ rif: null, lat: null, lon: null });
    expect(clienteAV3(cliente({ local_gps_lat: 0, local_gps_lon: 0 }))).toMatchObject({ lat: null, lon: null });
  });

  it('drogueriaAV3 arma la fila de dim_droguerias con su layout de exportación', () => {
    const d = { id: 'd1', id_numero: 1, codigo_drogueria: 'DROG-COBECA', nombre_drogueria: 'Cobeca', rif: 'J-00000000-0', email_pedidos: 'p@c.com', tiempo_entrega_promedio_dias: 2, formato_csv_config: FORMATO_CSV_POR_DEFECTO, activo: true, created_at: '' } as Drogueria;
    expect(drogueriaAV3(d)).toMatchObject({ codigo: 'DROG-COBECA', nombre: 'Cobeca', rif: null, dias_entrega: 2, email_pedidos: 'p@c.com' });
  });

  it('cliente descargado (v3) con la forma de las pantallas clásicas', () => {
    const c = clienteDesdeV3({ codigo_interno: 'CLI-1', razon_social: 'R', nombre_comercial: 'N', rif: null, frecuencia_dias: 30, lat: 10.5, lon: -66.8, estado_validacion: 'inactivo' });
    expect(c).toMatchObject({ ident01: 'CLI-1', nombre_fantasia: 'N', frecuencia: 'Mensual', local_gps_lat: 10.5, activo: false, rif: 'J-00000000-0' });
  });

  it('fusionarPorClave: la nube actualiza y agrega, lo local exclusivo se conserva y las droguerías conservan su layout local', () => {
    const local = [{ id: 'x1', k: 'A', v: 'local-A' }, { id: 'x2', k: 'B', v: 'local-B' }];
    const nube = [{ id: 'A', k: 'A', v: 'nube-A' }, { id: 'C', k: 'C', v: 'nube-C' }];
    expect(fusionarPorClave(local, nube, (x) => x.k, 'nube')).toEqual([{ id: 'x1', k: 'A', v: 'nube-A' }, { id: 'x2', k: 'B', v: 'local-B' }, { id: 'C', k: 'C', v: 'nube-C' }]);
    expect(fusionarPorClave(local, nube, (x) => x.k, 'local')).toEqual([{ id: 'x1', k: 'A', v: 'local-A' }, { id: 'x2', k: 'B', v: 'local-B' }, { id: 'C', k: 'C', v: 'nube-C' }]);
  });

  it('roles: teletransferencista <-> transferencista; un rol desconocido cae al mínimo', () => {
    expect(rolAV3('teletransferencista')).toBe('transferencista');
    expect(rolDesdeV3('transferencista')).toBe('teletransferencista');
    expect(rolDesdeV3('super')).toBe('vendedor');
  });
});

describe('envío de ventas y homologación al servidor', () => {
  const fila = (i: number, archivo: string, extra: Partial<HistoricoPedidoPrevio> = {}): HistoricoPedidoPrevio => ({
    id: `h${i}`, cliente_id: 'CLI-1', drogueria_id: 'd1', producto_id: 'SKU-1', fecha_pedido: '2026-03-05', equipo_origen: 'A',
    cantidad_solicitada: 1, cantidad_facturada: 2, precio_unitario: 0, descuento_porcentaje: 0, archivo_origen: archivo,
    nombre_drogueria: 'COBECA', cod_cliente_drogueria: 'C-1', nombre_cliente: 'LA PAZ', codigo_producto_drogueria: 'P-1', nombre_producto: 'X', cod_sap: 'SKU-1', ...extra,
  } as HistoricoPedidoPrevio);

  function clienteFalso() {
    const llamadas: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const sb = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        llamadas.push({ fn, args });
        if (fn === 'importar_ventas_drogueria') {
          const filas = args.p_filas as unknown[];
          return { data: { insertadas: filas.length, recibidas: filas.length, droguerias_desconocidas: ['FANTASMA'], homologacion: { clientes_enlazados: filas.length, productos_enlazados: filas.length, codigos_aprendidos: 1 } }, error: null };
        }
        return { data: { clientes: 1, productos: 1, omitidos: [{ tipo: 'producto' }] }, error: null };
      },
    } as unknown as SupabaseClient;
    return { sb, llamadas };
  }

  it('un lote por archivo, trozos de 1000 filas, códigos tal como los escribió la droguería', async () => {
    const { sb, llamadas } = clienteFalso();
    const historico = [...Array.from({ length: 2300 }, (_, i) => fila(i, 'enero.csv')), fila(9000, 'febrero.csv', { cod_cliente_drogueria: undefined })];
    const progreso: number[] = [];
    const r = await importarVentas(sb, historico, (e) => progreso.push(e));
    expect(llamadas.map((l) => (l.args.p_filas as unknown[]).length)).toEqual([1000, 1000, 300, 1]);
    expect(new Set(llamadas.slice(0, 3).map((l) => (l.args.p_lote as { checksum: string }).checksum)).size).toBe(1); // mismo lote en todos los trozos
    expect((llamadas[3].args.p_lote as { archivo: string }).archivo).toBe('febrero.csv');
    expect((llamadas[0].args.p_filas as Array<Record<string, unknown>>)[0]).toMatchObject({ n: 1, drogueria: 'COBECA', cod_cliente: 'C-1', cod_producto: 'P-1', cod_sap: 'SKU-1', unidades: 2 });
    expect((llamadas[3].args.p_filas as Array<Record<string, unknown>>)[0].cod_cliente).toBeNull(); // sin código: solo nombre
    expect(r).toMatchObject({ insertadas: 2301, droguerias_desconocidas: ['FANTASMA'], codigos_aprendidos: 4 });
    expect(progreso.at(-1)).toBe(2301);
  });

  it('el checksum del lote es estable y cambia si cambia el contenido', () => {
    const f = [{ fecha: '2026-03-01', unidades: 3 }, { fecha: '2026-03-09', unidades: 4 }];
    expect(checksumLote('a.csv', f)).toBe('a.csv|2|7|2026-03-01|2026-03-09');
    expect(checksumLote('a.csv', [...f, { fecha: '2026-04-01', unidades: 1 }])).not.toBe(checksumLote('a.csv', f));
  });

  it('homologación: solo alias verificados viajan; devuelve los omitidos para corregirlos', async () => {
    const { sb, llamadas } = clienteFalso();
    const r = await importarHomologacion(sb, {
      alias: [
        { id: '1', cliente_ident01: 'CLI-1', drogueria: 'COBECA', cod_cliente_drogueria: 'C-1', nombre_cliente_drogueria: 'LA PAZ', verificado: true },
        { id: '2', cliente_ident01: 'CLI-1', drogueria: 'COBECA', nombre_cliente_drogueria: 'OTRO', verificado: false },
      ],
      mapeos: [{ id: 'm', cod_sap: 'SKU-1', drogueria: 'COBECA', codigo_producto_drogueria: 'P-1', nombre_producto_drogueria: 'X' }],
    });
    const p = llamadas[0].args.p as { clientes: unknown[]; productos: unknown[] };
    expect(p.clientes).toEqual([{ drogueria: 'COBECA', codigo_interno: 'CLI-1', codigo_cuenta: 'C-1', nombre: 'LA PAZ' }]);
    expect(p.productos).toEqual([{ drogueria: 'COBECA', sku: 'SKU-1', codigo: 'P-1', descripcion: 'X' }]);
    expect(r.omitidos).toHaveLength(1);
  });
});

describe('usuarios: el rol lo fija la base, no los metadatos del registro', () => {
  it('equipos: código de la base <-> valor de las pantallas clásicas', () => {
    expect(['LA SANTE', 'la sante', 'Comercial', 'OTC', 'A', 'B', null, 'X'].map(equipoDesdeV3)).toEqual(['La Sante', 'La Sante', 'Comercial', 'OTC', 'A', 'B', 'TODOS', 'TODOS']);
    expect((['La Sante', 'OTC', 'A', 'TODOS', 'AMBOS'] as const).map(equipoAV3)).toEqual(['LA SANTE', 'OTC', 'A', null, null]);
  });

  it('el perfil sale de dim_usuarios (un rol "admin" en los metadatos no cuenta)', async () => {
    const sb = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { nombre_completo: 'Ana', rol: 'transferencista', activo: true, telefono: null, dim_equipos: { codigo: 'LA SANTE' } }, error: null }) }) }) }),
    } as unknown as SupabaseClient;
    expect(await cargarPerfilUsuario(sb, 'u1')).toEqual({ nombre_completo: 'Ana', rol: 'teletransferencista', equipo: 'La Sante', telefono: undefined, activo: true });
    const sinFila = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) } as unknown as SupabaseClient;
    expect(await cargarPerfilUsuario(sinFila, 'u2')).toBeNull();
  });

  it('crear usuario: registra sin rol en los metadatos y asigna rol/equipo con la función protegida', async () => {
    const llamadas: Array<Record<string, unknown>> = [];
    let registrado: Record<string, unknown> = {};
    const registro = { auth: { signUp: async (a: Record<string, unknown>) => ((registrado = a), { data: { user: { id: 'nuevo-1' } }, error: null }) } } as unknown as SupabaseClient;
    const admin = { rpc: async (fn: string, args: Record<string, unknown>) => (llamadas.push({ fn, ...args }), { error: null }) } as unknown as SupabaseClient;
    await crearUsuarioNube(admin, registro, { email: 'a@b.com', password: 'secreta1', nombre_completo: 'Ana', rol: 'teletransferencista', equipo: 'La Sante', activo: true });
    expect((registrado.options as { data: Record<string, unknown> }).data).toEqual({ nombre_completo: 'Ana' }); // sin rol ni equipo
    expect(llamadas).toEqual([{ fn: 'admin_configurar_usuario', p_usuario: 'nuevo-1', p_rol: 'transferencista', p_equipo_codigo: 'LA SANTE', p_activo: true, p_nombre: 'Ana', p_telefono: null }]);
  });

  it('si la función protegida rechaza (no es admin), se informa que la cuenta quedó creada pero sin rol', async () => {
    const registro = { auth: { signUp: async () => ({ data: { user: { id: 'n' } }, error: null }) } } as unknown as SupabaseClient;
    const admin = { rpc: async () => ({ error: { message: 'Solo administrador' } }) } as unknown as SupabaseClient;
    await expect(crearUsuarioNube(admin, registro, { email: 'a@b.com', password: 'x', nombre_completo: 'A', rol: 'admin', equipo: 'TODOS', activo: true })).rejects.toThrow(/no se pudo asignar rol/);
  });
});
