import type { SupabaseClient } from '@supabase/supabase-js';
import { ErrorRemoto } from './remoto';
import type { FilaRemota, OpcionesTraer, SyncRemote } from './remoto';
import type { TipoOutbox } from './types';

interface ErrorSupabase {
  message?: string;
  code?: string;
  status?: number;
}

/** Traduce el error de PostgREST/red a la clase que entiende la cola. */
export function clasificarError(e: ErrorSupabase | null | undefined): ErrorRemoto {
  const mensaje = e?.message || 'Error desconocido';
  const status = e?.status ?? 0;
  const codigo = e?.code ?? '';
  if (status === 401 || codigo === 'PGRST301' || /jwt|not authenticated/i.test(mensaje)) return new ErrorRemoto('auth', mensaje, codigo);
  // Sin respuesta HTTP (fetch falló), timeouts, limitación de tasa o caída del servidor.
  if (status === 0 || status === 408 || status === 429 || status >= 500 || /failed to fetch|network|timeout|load failed/i.test(mensaje)) {
    return new ErrorRemoto('red', mensaje, codigo);
  }
  return new ErrorRemoto('permanente', mensaje, codigo);
}

const RPC: Record<Exclude<TipoOutbox, 'pedido.rerutear'>, string> = {
  'prospecto.crear': 'sync_crear_prospecto',
  'pedido.crear': 'sync_crear_pedido',
  'pedido.modificar': 'sync_modificar_pedido',
  'visita.registrar': 'sync_registrar_visita',
  'plantilla.guardar': 'sync_guardar_plantilla',
};

/** Implementación de SyncRemote sobre supabase-js. Cada mutación es una RPC idempotente (ver el DDL, sección 10-11). */
export function crearRemotoSupabase(client: SupabaseClient): SyncRemote {
  return {
    async ejecutar(tipo, payload) {
      const { data, error } =
        tipo === 'pedido.rerutear'
          ? await client.rpc('rerutear_remanente', payload)
          : await client.rpc(RPC[tipo], { p: payload });
      if (error) throw clasificarError(error as ErrorSupabase);
      return (data ?? {}) as FilaRemota;
    },

    async traer(tabla: string, desde: string | null, limite: number, opciones: OpcionesTraer = {}) {
      let q = client.from(tabla).select(opciones.seleccion ?? '*');
      if (desde) q = q.gt('updated_at', desde);
      else if (opciones.creadoDesde) q = q.gte('created_at', opciones.creadoDesde);
      for (const [col, valor] of Object.entries(opciones.filtro ?? {})) q = q.eq(col, valor);
      for (const [col, valor] of Object.entries(opciones.minimo ?? {})) q = q.gte(col, valor);
      const { data, error } = await q.order('updated_at', { ascending: true }).limit(limite);
      if (error) throw clasificarError(error as ErrorSupabase);
      return (data ?? []) as unknown as FilaRemota[];
    },

    async traerPorId(tabla: string, id: string, seleccion = '*') {
      const { data, error } = await client.from(tabla).select(seleccion).eq('id', id).maybeSingle();
      if (error) throw clasificarError(error as ErrorSupabase);
      return (data ?? null) as unknown as FilaRemota | null;
    },

    async haySesion() {
      const { data } = await client.auth.getSession();
      return !!data.session;
    },
  };
}
