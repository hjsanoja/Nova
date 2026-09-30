import type { NovaDB } from './db';
import { textoBusquedaCliente, tokensProducto } from './busqueda';
import type { FilaRemota, SyncRemote } from './remoto';
import type { ReglaComercial } from './politicas';
import type {
  LocalCliente,
  LocalCompraMensual,
  LocalDetalle,
  LocalDrogueria,
  LocalMapCliente,
  LocalMapProducto,
  LocalComunicado,
  LocalMeta,
  LocalNotificacion,
  LocalPlantilla,
  LocalPedido,
  LocalProducto,
} from './types';

/**
 * Sincronización descendente por cursor: cada tabla se pide con `updated_at > cursor`, en páginas,
 * y se aplica con upsert. Reglas de convivencia con lo local:
 *  - una fila con cambios locales pendientes (sync_estado != 'sincronizado') no se pisa;
 *  - borrado lógico del servidor (deleted_at) => se elimina localmente.
 */

const PAGINA = 500;
const SOLAPE_MS = 5_000; // los commits pueden llegar fuera de orden: se re-pide un margen y el upsert es idempotente
const DIAS_HISTORIAL = 90;
const MESES_COMPRAS = 6; // el sugerido usa las últimas compras: no se baja todo el histórico al dispositivo

const str = (v: unknown): string => (v == null ? '' : String(v));
const strN = (v: unknown): string | null => (v == null ? null : String(v));
const numN = (v: unknown): number | null => (v == null ? null : Number(v));

interface TablaPull {
  /** Tabla remota. */
  remota: string;
  /** Aplica una página en la base local. */
  aplicar: (db: NovaDB, filas: FilaRemota[]) => Promise<void>;
  acotarHistorial?: boolean;
  /** Descarga solo los últimos MESES_COMPRAS meses según esta columna de fecha (p. ej. `periodo`). */
  acotarMeses?: string;
  /** Limpia lo que salió de la ventana local tras una descarga (p. ej. compras de hace más de MESES_COMPRAS meses). */
  podar?: (db: NovaDB) => Promise<void>;
  /**
   * Tras una descarga COMPLETA (sin cursor), retira lo local que el servidor ya no entrega a este usuario
   * (p. ej. una farmacia que le quitaron del fichero). Recibe los ids que sí llegaron.
   */
  podarNoVistos?: (db: NovaDB, vistos: Set<string>) => Promise<void>;
  seleccion?: string;
}

const borrados = (filas: FilaRemota[]) => filas.filter((f) => f.deleted_at != null).map((f) => str(f.id));
const vigentes = (filas: FilaRemota[]) => filas.filter((f) => f.deleted_at == null);

export const TABLAS_PULL: TablaPull[] = [
  {
    remota: 'dim_productos',
    aplicar: async (db, filas) => {
      await db.productos.bulkDelete(borrados(filas));
      await db.productos.bulkPut(
        vigentes(filas).map<LocalProducto>((f) => {
          const base = {
            sku: str(f.sku),
            ean13: strN(f.ean13),
            nombre_comercial: str(f.nombre_comercial),
            principio_activo: strN(f.principio_activo),
            presentacion: strN(f.presentacion),
          };
          return {
            id: str(f.id),
            ...base,
            categoria: strN(f.categoria),
            laboratorio: strN(f.laboratorio),
            equipo_id: strN(f.equipo_id),
            empaque_minimo: Number(f.empaque_minimo ?? 1),
            es_prioritario: f.es_prioritario === true,
            activo: f.activo !== false,
            foto_url: strN(f.foto_url),
            updated_at: str(f.updated_at),
            tokens: tokensProducto(base),
          };
        })
      );
    },
  },
  {
    remota: 'dim_droguerias',
    aplicar: async (db, filas) => {
      await db.droguerias.bulkDelete(borrados(filas));
      await db.droguerias.bulkPut(
        vigentes(filas).map<LocalDrogueria>((f) => ({
          id: str(f.id),
          codigo: str(f.codigo),
          nombre: str(f.nombre),
          formato_export: f.formato_export as LocalDrogueria['formato_export'],
          activo: f.activo !== false,
        }))
      );
    },
  },
  {
    remota: 'dim_clientes',
    podarNoVistos: async (db, vistos) => {
      const sobran = (await db.clientes.toArray()).filter((c) => c.sync_estado === 'sincronizado' && !vistos.has(c.id)).map((c) => c.id);
      if (sobran.length) await db.clientes.bulkDelete(sobran);
    },
    aplicar: async (db, filas) => {
      const ids = filas.map((f) => str(f.id));
      const locales = new Map((await db.clientes.bulkGet(ids)).filter((c): c is LocalCliente => !!c).map((c) => [c.id, c]));
      const sucio = (id: string) => (locales.get(id)?.sync_estado ?? 'sincronizado') !== 'sincronizado';
      await db.clientes.bulkDelete(borrados(filas).filter((id) => !sucio(id)));
      await db.clientes.bulkPut(
        vigentes(filas)
          .filter((f) => !sucio(str(f.id)))
          .map<LocalCliente>((f) => {
            const c: LocalCliente = {
              id: str(f.id),
              codigo_interno: strN(f.codigo_interno),
              razon_social: str(f.razon_social),
              nombre_comercial: str(f.nombre_comercial),
              rif: strN(f.rif),
              brick: strN(f.brick),
              municipio: strN(f.municipio),
              bandera: strN(f.bandera),
              direccion: strN(f.direccion),
              telefono: strN(f.telefono),
              lat: numN(f.lat),
              lon: numN(f.lon),
              frecuencia_dias: numN(f.frecuencia_dias),
              estado_validacion: f.estado_validacion as LocalCliente['estado_validacion'],
              segmento: f.segmento as LocalCliente['segmento'],
              updated_at: str(f.updated_at),
              sync_estado: 'sincronizado',
              busqueda: '',
            };
            c.busqueda = textoBusquedaCliente(c);
            return c;
          })
      );
    },
  },
  {
    remota: 'map_producto_drogueria',
    aplicar: async (db, filas) => {
      await db.mapProductos.bulkDelete(borrados(filas));
      await db.mapProductos.bulkPut(
        vigentes(filas).map<LocalMapProducto>((f) => ({
          id: str(f.id),
          drogueria_id: str(f.drogueria_id),
          producto_id: str(f.producto_id),
          codigo_drogueria: str(f.codigo_drogueria),
          descripcion_drogueria: strN(f.descripcion_drogueria),
          es_principal: f.es_principal !== false,
        }))
      );
    },
  },
  {
    remota: 'map_cliente_drogueria',
    aplicar: async (db, filas) => {
      await db.mapClientes.bulkDelete(borrados(filas));
      await db.mapClientes.bulkPut(
        vigentes(filas).map<LocalMapCliente>((f) => ({
          id: str(f.id),
          drogueria_id: str(f.drogueria_id),
          cliente_id: str(f.cliente_id),
          codigo_cuenta: strN(f.codigo_cuenta),
          nombre_en_drogueria: strN(f.nombre_en_drogueria),
          es_principal: f.es_principal !== false,
        }))
      );
    },
  },
  {
    remota: 'fact_compras_mensual',
    acotarMeses: 'periodo',
    podar: async (db) => {
      const corte = inicioMes(MESES_COMPRAS);
      const viejas = await db.comprasMensual.filter((c) => c.periodo < corte).primaryKeys();
      if (viejas.length) await db.comprasMensual.bulkDelete(viejas);
    },
    aplicar: async (db, filas) => {
      await db.comprasMensual.bulkDelete(borrados(filas));
      await db.comprasMensual.bulkPut(
        vigentes(filas).map<LocalCompraMensual>((f) => ({
          id: str(f.id),
          cliente_id: str(f.cliente_id),
          producto_id: str(f.producto_id),
          periodo: str(f.periodo),
          unidades: Number(f.unidades),
          n_compras: Number(f.n_compras ?? 1),
          ultima_compra: str(f.ultima_compra),
        }))
      );
    },
  },
  {
    remota: 'config_reglas_comerciales',
    aplicar: async (db, filas) => {
      await db.reglas.bulkDelete(borrados(filas));
      await db.reglas.bulkPut(
        vigentes(filas).map<ReglaComercial>((f) => ({
          id: str(f.id),
          nombre: str(f.nombre),
          alcance: f.alcance as ReglaComercial['alcance'],
          descuento_max_pct: Number(f.descuento_max_pct ?? 0),
          min_skus_distintos: numN(f.min_skus_distintos),
          min_unidades_totales: numN(f.min_unidades_totales),
          min_unidades_categoria: numN(f.min_unidades_categoria),
          categoria_objetivo: strN(f.categoria_objetivo),
          bonificacion: (f.bonificacion as ReglaComercial['bonificacion']) ?? null,
          equipo_id: strN(f.equipo_id),
          drogueria_id: strN(f.drogueria_id),
          segmento_cliente: (f.segmento_cliente as ReglaComercial['segmento_cliente']) ?? null,
          vigente_desde: str(f.vigente_desde),
          vigente_hasta: strN(f.vigente_hasta),
          prioridad: Number(f.prioridad ?? 100),
          activo: f.activo !== false,
        }))
      );
    },
  },
  {
    remota: 'fact_pedidos',
    acotarHistorial: true,
    aplicar: async (db, filas) => {
      const locales = new Map((await db.pedidos.bulkGet(filas.map((f) => str(f.id)))).filter((p): p is LocalPedido => !!p).map((p) => [p.id, p]));
      const sucio = (id: string) => (locales.get(id)?.sync_estado ?? 'sincronizado') !== 'sincronizado';
      await db.pedidos.bulkDelete(borrados(filas).filter((id) => !sucio(id)));
      await db.pedidos.bulkPut(
        vigentes(filas)
          .filter((f) => !sucio(str(f.id)))
          .map<LocalPedido>((f) => ({
            id: str(f.id),
            correlativo: str(f.correlativo),
            correlativo_provisional: false,
            folio_local: str(f.folio_local),
            parent_pedido_id: strN(f.parent_pedido_id),
            pedido_raiz_id: strN(f.pedido_raiz_id),
            sufijo_derivado: numN(f.sufijo_derivado),
            cliente_id: str(f.cliente_id),
            drogueria_id: str(f.drogueria_id),
            vendedor_id: str(f.vendedor_id),
            equipo_id: strN(f.equipo_id),
            estado: f.estado as LocalPedido['estado'],
            requiere_revision_especial: f.requiere_revision_especial === true,
            motivos_revision: (f.motivos_revision as LocalPedido['motivos_revision']) ?? [],
            condicion_comercial_id: strN(f.condicion_comercial_id),
            descuento_pedido_pct: numN(f.descuento_pedido_pct),
            observaciones: strN(f.observaciones),
            numero_factura: strN(f.numero_factura),
            device_id: str(f.device_id),
            created_at: str(f.created_at),
            updated_at: str(f.updated_at),
            row_version: Number(f.row_version ?? 1),
            sync_estado: 'sincronizado',
            sync_error: null,
          }))
      );
    },
  },
  {
    remota: 'fact_pedido_detalles',
    acotarHistorial: true,
    aplicar: async (db, filas) => {
      const pedidos = await db.pedidos.bulkGet(Array.from(new Set(filas.map((f) => str(f.pedido_id)))));
      const sucios = new Set(pedidos.filter((p): p is LocalPedido => !!p && p.sync_estado !== 'sincronizado').map((p) => p.id));
      const validas = filas.filter((f) => !sucios.has(str(f.pedido_id)));
      await db.detalles.bulkDelete(borrados(validas));
      await db.detalles.bulkPut(
        vigentes(validas).map<LocalDetalle>((f) => ({
          id: str(f.id),
          pedido_id: str(f.pedido_id),
          linea: Number(f.linea ?? 1),
          producto_id: str(f.producto_id),
          unidades_solicitadas: Number(f.unidades_solicitadas),
          unidades_confirmadas: numN(f.unidades_confirmadas),
          unidades_pendientes: Number(f.unidades_pendientes ?? f.unidades_solicitadas),
          motivo_ajuste: (f.motivo_ajuste as LocalDetalle['motivo_ajuste']) ?? 'sin_quiebre',
          descuento_pct: numN(f.descuento_pct),
          notas_linea: strN(f.notas_linea),
          detalle_origen_id: strN(f.detalle_origen_id),
          remanente_derivado_en: strN(f.remanente_derivado_en),
        }))
      );
    },
  },
  {
    remota: 'notificaciones',
    aplicar: async (db, filas) => {
      await db.notificaciones.bulkDelete(borrados(filas));
      await db.notificaciones.bulkPut(
        vigentes(filas).map<LocalNotificacion>((f) => ({
          id: str(f.id),
          usuario_id: str(f.usuario_id),
          tipo: str(f.tipo),
          titulo: str(f.titulo),
          cuerpo: strN(f.cuerpo),
          pedido_id: strN(f.pedido_id),
          leida: f.leida === true,
          created_at: str(f.created_at),
        }))
      );
    },
  },
  {
    remota: 'plantillas_pedido',
    aplicar: async (db, filas) => {
      const locales = new Map((await db.plantillas.bulkGet(filas.map((f) => str(f.id)))).filter((p): p is LocalPlantilla => !!p).map((p) => [p.id, p]));
      const sucio = (id: string) => (locales.get(id)?.sync_estado ?? 'sincronizado') !== 'sincronizado';
      await db.plantillas.bulkDelete(borrados(filas).filter((id) => !sucio(id)));
      await db.plantillas.bulkPut(
        vigentes(filas)
          .filter((f) => !sucio(str(f.id)))
          .map<LocalPlantilla>((f) => ({
            id: str(f.id),
            vendedor_id: str(f.vendedor_id),
            cliente_id: str(f.cliente_id),
            drogueria_id: strN(f.drogueria_id),
            nombre: str(f.nombre),
            lineas: Array.isArray(f.lineas) ? (f.lineas as LocalPlantilla['lineas']) : [],
            updated_at: str(f.updated_at),
            sync_estado: 'sincronizado',
          }))
      );
    },
  },
  {
    remota: 'comunicados',
    podarNoVistos: async (db, vistos) => {
      const sobran = (await db.comunicados.toCollection().primaryKeys()).filter((id) => !vistos.has(id));
      if (sobran.length) await db.comunicados.bulkDelete(sobran);
    },
    seleccion: '*,para_mi',
    aplicar: async (db, filas) => {
      await db.comunicados.bulkDelete(borrados(filas));
      await db.comunicados.bulkPut(
        vigentes(filas).map<LocalComunicado>((f) => ({
          id: str(f.id),
          titulo: str(f.titulo),
          mensaje: str(f.mensaje),
          tipo: (f.tipo as LocalComunicado['tipo']) ?? 'anuncio',
          roles: (f.roles as string[] | null) ?? [],
          equipos: (f.equipos as string[] | null) ?? [],
          estados: (f.estados as string[] | null) ?? [],
          ciudades: (f.ciudades as string[] | null) ?? [],
          regiones: (f.regiones as string[] | null) ?? [],
          vigente_desde: str(f.vigente_desde),
          vigente_hasta: strN(f.vigente_hasta),
          para_mi: f.para_mi !== false,
          creado_por: strN(f.creado_por),
          created_at: str(f.created_at),
          updated_at: str(f.updated_at),
        }))
      );
    },
  },
  {
    remota: 'metas',
    podarNoVistos: async (db, vistos) => {
      const sobran = (await db.metas.toCollection().primaryKeys()).filter((id) => !vistos.has(id));
      if (sobran.length) await db.metas.bulkDelete(sobran);
    },
    aplicar: async (db, filas) => {
      await db.metas.bulkDelete(borrados(filas));
      await db.metas.bulkPut(
        vigentes(filas).map<LocalMeta>((f) => ({
          id: str(f.id),
          periodo: str(f.periodo),
          vendedor_id: strN(f.vendedor_id),
          cliente_id: strN(f.cliente_id),
          drogueria_id: strN(f.drogueria_id),
          indicador: (f.indicador as LocalMeta['indicador']) ?? 'unidades',
          objetivo: Number(f.objetivo),
          updated_at: str(f.updated_at),
        }))
      );
    },
  },
];

const claveCursor = (tabla: string) => `cursor:${tabla}`;

/** Primer día del mes de hace `meses` meses (YYYY-MM-DD). */
function inicioMes(meses: number, ahora = new Date()): string {
  const d = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - meses, 1));
  return d.toISOString().slice(0, 10);
}

/** Baja los cambios de una tabla hasta agotarla. Devuelve cuántas filas aplicó. */
export async function traerTabla(db: NovaDB, remoto: SyncRemote, t: TablaPull): Promise<number> {
  let cursor = await db.leerMeta<string | null>(claveCursor(t.remota), null);
  const creadoDesde = t.acotarHistorial ? new Date(Date.now() - DIAS_HISTORIAL * 86_400_000).toISOString() : undefined;
  const minimo = t.acotarMeses ? { [t.acotarMeses]: inicioMes(MESES_COMPRAS) } : undefined;
  const completa = cursor === null;
  const vistos = new Set<string>();
  let total = 0;
  for (;;) {
    const desde = cursor ? new Date(new Date(cursor).getTime() - SOLAPE_MS).toISOString() : null;
    const filas = await remoto.traer(t.remota, desde, PAGINA, { creadoDesde, seleccion: t.seleccion, minimo });
    if (filas.length === 0) break;
    await t.aplicar(db, filas);
    if (t.podarNoVistos) filas.forEach((f) => vistos.add(str(f.id)));
    total += filas.length;
    const ultimo = str(filas[filas.length - 1].updated_at);
    // Si toda la página es anterior al cursor (solo el solape), no hay más novedades.
    const avanzo = !cursor || ultimo > cursor;
    if (avanzo) {
      cursor = ultimo;
      await db.guardarMeta(claveCursor(t.remota), cursor);
    }
    if (filas.length < PAGINA || !avanzo) break;
  }
  if (t.podar && total > 0) await t.podar(db);
  if (t.podarNoVistos && completa) await t.podarNoVistos(db, vistos);
  return total;
}

export async function traerTodo(db: NovaDB, remoto: SyncRemote): Promise<number> {
  let total = 0;
  for (const t of TABLAS_PULL) total += await traerTabla(db, remoto, t);
  return total;
}
