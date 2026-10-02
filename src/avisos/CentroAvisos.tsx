import { useState } from 'react';
import { BellOff, CheckCheck, ListTodo, PackageCheck, PackageX, Target, Trophy, Truck, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { obtenerDb } from '../offline/db';
import { useLive } from '../offline/useLive';
import { getSupabaseClient } from '../services/supabaseClient';
import type { LocalNotificacion } from '../offline/types';
import { Subtitulo, Tarjeta, Vacio } from '../components/ui/kit';

const ICONO: Record<string, { icono: LucideIcon; clase: string; critico?: boolean }> = {
  pedido_parcial: { icono: Truck, clase: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  pedido_procesado_total: { icono: PackageCheck, clase: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  pedido_rechazado: { icono: PackageX, clase: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300', critico: true },
  meta_en_riesgo: { icono: Target, clase: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  meta_cumplida: { icono: Trophy, clase: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  tarea_vence: { icono: ListTodo, clase: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300' },
};

export function haceCuanto(iso: string, ahora = Date.now()): string {
  const min = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

/** Marca avisos como leídos en el dispositivo y en la nube (si hay conexión). */
async function marcarLeidos(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = obtenerDb();
  await db.notificaciones.where('id').anyOf(ids).modify({ leida: true });
  const sb = getSupabaseClient();
  if (sb) await Promise.resolve(sb.from('notificaciones').update({ leida: true }).in('id', ids)).catch(() => undefined);
}

/**
 * Centro de avisos: lo último que le pasó a mis pedidos (despachado, parcial, rechazado) y a mis metas (en riesgo,
 * cumplida). Los críticos se destacan. Cerrar un aviso lo marca como leído; tocarlo lleva a donde corresponde.
 */
export function CentroAvisos({ onAbrir, limite = 4 }: { onAbrir: (aviso: LocalNotificacion) => void; limite?: number }) {
  const db = obtenerDb();
  const avisos = useLive(() => db.notificaciones.filter((n) => !n.leida).toArray(), [], [] as LocalNotificacion[]);
  const [todos, setTodos] = useState(false);
  const lista = [...avisos].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const visibles = todos ? lista : lista.slice(0, limite);

  return (
    <Tarjeta>
      <Subtitulo accion={lista.length > 0 ? <button type="button" onClick={() => void marcarLeidos(lista.map((n) => n.id))} className="inline-flex items-center gap-1 text-xs font-semibold text-marca-700 hover:underline dark:text-marca-300"><CheckCheck className="h-3.5 w-3.5" aria-hidden /> Marcar todo leído</button> : undefined}>
        Centro de avisos{lista.length > 0 ? ` · ${lista.length}` : ''}
      </Subtitulo>
      {lista.length === 0 ? (
        <Vacio icono={BellOff} titulo="Sin avisos nuevos" texto="Aquí verás cuando la droguería despache, despache a medias o rechace un pedido, y cómo van tus metas." />
      ) : (
        <ul className="flex flex-col gap-2">
          {visibles.map((n) => {
            const tipo = ICONO[n.tipo] ?? { icono: Truck, clase: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' };
            const Icono = tipo.icono;
            return (
              <li key={n.id} className={`animate-in group relative flex items-start gap-3 rounded-xl p-2.5 transition-colors ${tipo.critico ? 'border border-rose-200 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/30' : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800'}`}>
                <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tipo.clase}`}><Icono className="h-4.5 w-4.5" aria-hidden /></span>
                <button type="button" onClick={() => onAbrir(n)} className="min-w-0 flex-1 text-left">
                  <span className={`block text-sm font-semibold ${tipo.critico ? 'text-rose-900 dark:text-rose-200' : 'text-slate-900 dark:text-white'}`}>{n.titulo}</span>
                  {n.cuerpo && <span className="block text-xs text-slate-600 dark:text-slate-300">{n.cuerpo}</span>}
                  <span className="mt-0.5 block text-[11px] font-medium text-slate-400">{haceCuanto(n.created_at)}</span>
                </button>
                <button type="button" onClick={() => void marcarLeidos([n.id])} aria-label={`Marcar como leído: ${n.titulo}`} className="-m-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {lista.length > limite && (
        <button type="button" onClick={() => setTodos((v) => !v)} className="mt-3 w-full rounded-xl bg-slate-100 py-2 text-sm font-semibold text-marca-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-marca-300 dark:hover:bg-slate-700">
          {todos ? 'Ver menos' : `Ver todos (${lista.length})`}
        </button>
      )}
    </Tarjeta>
  );
}
