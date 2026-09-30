import { useEffect, useState } from 'react';
import { obtenerDb } from '../offline/db';
import { useLive } from '../offline/useLive';
import { getSupabaseClient } from '../services/supabaseClient';
import type { LocalCliente, LocalCompraMensual, LocalDetalle, LocalDrogueria, LocalMapCliente, LocalMapProducto, LocalPedido, LocalProducto } from '../offline/types';

/** Lecturas reactivas de la base local: se actualizan solas con cada sincronización o cambio. */
export const useClientes = () => useLive(() => obtenerDb().clientes.toArray(), [], [] as LocalCliente[]);
export const useProductos = () => useLive(() => obtenerDb().productos.toArray(), [], [] as LocalProducto[]);
export const useDroguerias = () => useLive(() => obtenerDb().droguerias.toArray(), [], [] as LocalDrogueria[]);
export const usePedidos = () => useLive(() => obtenerDb().pedidos.toArray(), [], [] as LocalPedido[]);
export const useDetalles = () => useLive(() => obtenerDb().detalles.toArray(), [], [] as LocalDetalle[]);
export const useCompras = () => useLive(() => obtenerDb().comprasMensual.toArray(), [], [] as LocalCompraMensual[]);
export const useMapProductos = () => useLive(() => obtenerDb().mapProductos.toArray(), [], [] as LocalMapProducto[]);
export const useMapClientes = () => useLive(() => obtenerDb().mapClientes.toArray(), [], [] as LocalMapCliente[]);

/** Última compra reportada por las droguerías, por farmacia. */
export function ultimaCompraPorCliente(compras: LocalCompraMensual[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of compras) if (!m.has(c.cliente_id) || c.ultima_compra > (m.get(c.cliente_id) as string)) m.set(c.cliente_id, c.ultima_compra);
  return m;
}

/** Último pedido hecho en Nova, por farmacia (sin borradores ni cancelados). */
export function ultimoPedidoPorCliente(pedidos: LocalPedido[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of pedidos) {
    if (p.estado === 'borrador' || p.estado === 'cancelado') continue;
    if (!m.has(p.cliente_id) || p.created_at > (m.get(p.cliente_id) as string)) m.set(p.cliente_id, p.created_at);
  }
  return m;
}

export interface UsuarioNube {
  id: string;
  nombre_completo: string;
  email: string;
  rol: string;
  activo: boolean;
  equipo: string | null;
  telefono: string | null;
}

/** Personas de la organización (la mesa y la gerencia ven a todos; un vendedor solo se ve a sí mismo). Vacío en modo demostración. */
export function useUsuariosNube(recargar = 0): { usuarios: UsuarioNube[]; cargando: boolean; error: string } {
  const [estado, setEstado] = useState({ usuarios: [] as UsuarioNube[], cargando: true, error: '' });
  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return setEstado({ usuarios: [], cargando: false, error: '' });
    let vivo = true;
    void (async () => {
      const { data, error } = await sb.from('dim_usuarios').select('id,nombre_completo,email,rol,activo,telefono,dim_equipos(codigo)').is('deleted_at', null).order('nombre_completo');
      if (!vivo) return;
      if (error) return setEstado({ usuarios: [], cargando: false, error: error.message });
      setEstado({
        usuarios: (data ?? []).map((u) => ({
          id: u.id as string,
          nombre_completo: u.nombre_completo as string,
          email: u.email as string,
          rol: u.rol as string,
          activo: u.activo as boolean,
          telefono: (u.telefono as string | null) ?? null,
          equipo: ((u as { dim_equipos?: { codigo?: string } | null }).dim_equipos?.codigo as string | undefined) ?? null,
        })),
        cargando: false,
        error: '',
      });
    })();
    return () => {
      vivo = false;
    };
  }, [recargar]);
  return estado;
}
