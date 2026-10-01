import { useEffect, useMemo, useState } from 'react';
import type { LocalCliente, LocalCompraMensual, LocalPedido } from '../offline/types';
import { getSupabaseClient } from '../services/supabaseClient';
import { evaluarRiesgo, historialLocal } from './riesgo';
import type { FarmaciaRiesgo, HistorialCompra } from './riesgo';

/**
 * Farmacias en riesgo de quien usa la app. Con conexión usa el historial completo de la base (último año); sin conexión,
 * lo que hay en el equipo. Un pedido recién hecho en el equipo actualiza la "última compra" aunque la base no lo tenga aún.
 */
export function useRiesgoFarmacias(clientes: LocalCliente[], pedidos: LocalPedido[], unidades: Map<string, number>, compras: LocalCompraMensual[]): { lista: FarmaciaRiesgo[]; deLaNube: boolean } {
  const [nube, setNube] = useState<Map<string, HistorialCompra> | null>(null);
  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;
    let vivo = true;
    void Promise.resolve(sb.rpc('historial_compra_farmacias')).then(({ data, error }) => {
      if (!vivo || error || !Array.isArray(data)) return;
      setNube(new Map((data as HistorialCompra[]).map((h) => [h.cliente_id, { ...h, ultima: String(h.ultima).slice(0, 10), unidades_mes: Number(h.unidades_mes ?? 0), compras: Number(h.compras ?? 0) }])));
    }).catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);
  const local = useMemo(() => historialLocal(pedidos, unidades, compras), [pedidos, unidades, compras]);
  const lista = useMemo(() => {
    if (!nube) return evaluarRiesgo(clientes, local);
    const mezcla = new Map(nube);
    for (const [id, h] of local) {
      const n = mezcla.get(id);
      if (!n) mezcla.set(id, h);
      else if (h.ultima > n.ultima) mezcla.set(id, { ...n, ultima: h.ultima });
    }
    return evaluarRiesgo(clientes, mezcla);
  }, [clientes, local, nube]);
  return { lista, deLaNube: !!nube };
}
