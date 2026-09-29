import React from 'react';
import { History, Trash2 } from 'lucide-react';
import { obtenerDb } from '../../offline/db';
import { useLive } from '../../offline/useLive';
import type { LocalPlantilla } from '../../offline/types';
import { Sheet } from './Sheet';

interface Props {
  abierto: boolean;
  clienteId: string | null;
  onCerrar: () => void;
  onAplicar: (items: { producto_id: string; unidades: number }[], nombre: string) => void;
}

/** Plantillas de reposición (módulo C.4): duplicar un pedido recurrente en un toque. */
export const PlantillasSheet: React.FC<Props> = ({ abierto, clienteId, onCerrar, onAplicar }) => {
  const db = obtenerDb();
  const plantillas = useLive(
    async () => (await db.plantillas.toArray()).filter((p) => !p.cliente_id || p.cliente_id === clienteId),
    [clienteId],
    [] as LocalPlantilla[]
  );
  const ultimo = useLive(
    async () => {
      if (!clienteId) return null;
      const pedidos = (await db.pedidos.where('cliente_id').equals(clienteId).toArray())
        .filter((p) => !['borrador', 'cancelado', 'rechazado'].includes(p.estado))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      if (!pedidos[0]) return null;
      const detalles = await db.detalles.where('pedido_id').equals(pedidos[0].id).toArray();
      return { pedido: pedidos[0], items: detalles.map((d) => ({ producto_id: d.producto_id, unidades: d.unidades_solicitadas })) };
    },
    [clienteId],
    null
  );

  return (
    <Sheet abierto={abierto} titulo="Plantillas de reposición" onCerrar={onCerrar}>
      <ul className="space-y-2">
        {ultimo && (
          <li>
            <button type="button" onClick={() => onAplicar(ultimo.items, `Último pedido ${ultimo.pedido.correlativo}`)} className="flex min-h-14 w-full items-center gap-3 rounded-xl bg-teal-50 px-3 text-left dark:bg-teal-950/40">
              <History className="h-5 w-5 shrink-0 text-teal-700 dark:text-teal-300" />
              <span className="min-w-0">
                <span className="block font-semibold text-slate-900 dark:text-white">Repetir el último pedido</span>
                <span className="block truncate text-xs text-slate-500">{ultimo.pedido.correlativo} · {ultimo.items.length} productos</span>
              </span>
            </button>
          </li>
        )}
        {plantillas.map((p) => (
          <li key={p.id} className="flex items-center gap-2">
            <button type="button" onClick={() => onAplicar(p.items, p.nombre)} className="flex min-h-14 flex-1 items-center justify-between rounded-xl bg-slate-50 px-3 text-left dark:bg-slate-800">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-slate-900 dark:text-white">{p.nombre}</span>
                <span className="block text-xs text-slate-500">{p.items.length} productos · {p.items.reduce((a, i) => a + i.unidades, 0)} uds</span>
              </span>
            </button>
            <button type="button" aria-label={`Eliminar ${p.nombre}`} onClick={() => void db.plantillas.delete(p.id)} className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40">
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
        {!ultimo && plantillas.length === 0 && <li className="py-6 text-center text-sm text-slate-500">Aún no hay plantillas. Guarda un carrito desde “Guardar como plantilla”.</li>}
      </ul>
    </Sheet>
  );
};
