import { NovaDB } from '../db';
import { tokensProducto, textoBusquedaCliente } from '../busqueda';
import type { FilaRemota, SyncRemote } from '../remoto';
import { ErrorRemoto } from '../remoto';
import type { ReglaComercial } from '../politicas';
import type { FormatoExport, LocalCliente, LocalDrogueria, LocalProducto, TipoOutbox } from '../types';

let contador = 0;

/** Base IndexedDB aislada por prueba (fake-indexeddb en memoria). */
export function crearDbTemporal(): NovaDB {
  return new NovaDB(`nova-test-${++contador}-${Math.random().toString(36).slice(2)}`);
}

export const SESION = { vendedor_id: 'vend-1', equipo_id: 'eq-etico' };

export function producto(id: string, nombre: string, extra: Partial<LocalProducto> = {}): LocalProducto {
  const base = { sku: `SKU-${id}`, ean13: `759${id.padStart(10, '0')}`, nombre_comercial: nombre, principio_activo: null, presentacion: null };
  return { id, ...base, categoria: 'cardio', empaque_minimo: 10, es_prioritario: false, activo: true, tokens: tokensProducto(base), ...extra };
}

export function cliente(id: string, extra: Partial<LocalCliente> = {}): LocalCliente {
  const c: LocalCliente = {
    id,
    codigo_interno: `CLI-${id}`,
    razon_social: `Farmacia ${id} C.A.`,
    nombre_comercial: `Farmacia ${id}`,
    rif: `J-${id}`,
    estado_validacion: 'activo',
    segmento: 'estandar',
    frecuencia_dias: 7,
    sync_estado: 'sincronizado',
    busqueda: '',
    ...extra,
  };
  c.busqueda = textoBusquedaCliente(c);
  return c;
}

export const FORMATO_CSV: FormatoExport = {
  formato: 'csv',
  delimitador: ';',
  encabezado: true,
  entrecomillado: 'solo_texto',
  salto_linea: '\r\n',
  codificacion: 'utf-8',
  extension: 'csv',
  decimal: 'punto',
  formato_fecha: 'YYYYMMDD',
  nombre_archivo: '{drogueria}_{correlativo}.{extension}',
  columnas: [
    { encabezado: 'COD_CLIENTE', origen: 'codigo_cliente_drogueria' },
    { encabezado: 'COD_PRODUCTO', origen: 'codigo_producto_drogueria' },
    { encabezado: 'DESCRIPCION', origen: 'descripcion_producto_drogueria' },
    { encabezado: 'CANTIDAD', origen: 'unidades_confirmadas' },
    { encabezado: 'PEDIDO', origen: 'correlativo' },
  ],
};

export function drogueria(id: string, formato: FormatoExport = FORMATO_CSV): LocalDrogueria {
  return { id, codigo: id.toUpperCase(), nombre: `Droguería ${id}`, formato_export: formato, activo: true };
}

export const REGLA_BASE: ReglaComercial = {
  id: 'r-base', nombre: 'Base', alcance: 'linea', descuento_max_pct: 5, vigente_desde: '2020-01-01', prioridad: 100, activo: true,
};
export const REGLA_MIX: ReglaComercial = {
  id: 'r-mix', nombre: 'Mix 3 SKUs', alcance: 'linea', descuento_max_pct: 12, min_skus_distintos: 3, vigente_desde: '2020-01-01', prioridad: 50, activo: true,
};

export interface RemotoFalso extends SyncRemote {
  llamadas: { tipo: TipoOutbox; payload: Record<string, unknown> }[];
  /** Cambia cómo responde el "servidor". */
  comportamiento: (tipo: TipoOutbox, payload: Record<string, unknown>, n: number) => FilaRemota | ErrorRemoto;
}

/** Servidor simulado: aplica idempotencia por id y asigna correlativos como lo haría la base de datos. */
export function crearRemotoFalso(): RemotoFalso {
  let secuencia = 1000;
  const raices = new Map<string, string>();
  const hijosPorRaiz = new Map<string, number>();
  const vistos = new Map<string, FilaRemota>();
  const remoto: RemotoFalso = {
    llamadas: [],
    comportamiento(tipo, payload) {
      const id = String(payload.id ?? payload.p_nuevo_id);
      if (vistos.has(id)) return { ...vistos.get(id)!, ya_existia: true };
      let respuesta: FilaRemota;
      switch (tipo) {
        case 'pedido.crear': {
          const correlativo = `PED-${++secuencia}`;
          raices.set(id, correlativo);
          respuesta = { id, correlativo, estado: payload.estado === 'borrador' ? 'borrador' : 'enviado_teletransferencia', requiere_revision_especial: false, motivos_revision: [], row_version: 1 };
          break;
        }
        case 'pedido.rerutear': {
          const raiz = raices.get(String(payload.p_pedido)) ?? 'PED-0';
          const n = (hijosPorRaiz.get(raiz) ?? 0) + 1;
          hijosPorRaiz.set(raiz, n);
          respuesta = {
            id, correlativo: `${raiz}-R${n}`, estado: 'en_revision', row_version: 1,
            detalles: [{ id: `srv-${id}-1`, linea: 1, producto_id: '1', unidades_solicitadas: 5, descuento_pct: null, detalle_origen_id: null }],
          };
          break;
        }
        case 'visita.registrar':
          respuesta = { id, distancia_metros: 42, dentro_de_radio: true };
          break;
        case 'prospecto.crear':
          respuesta = { id, estado_validacion: 'prospecto_pendiente' };
          break;
        default:
          respuesta = { id };
      }
      vistos.set(id, respuesta);
      return respuesta;
    },
    async ejecutar(tipo, payload) {
      remoto.llamadas.push({ tipo, payload });
      const r = remoto.comportamiento(tipo, payload, remoto.llamadas.length);
      if (r instanceof ErrorRemoto) throw r;
      return r;
    },
    async traer() {
      return [];
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
