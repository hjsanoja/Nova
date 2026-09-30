import { useMemo, useState } from 'react';
import { BadgePercent, ChevronLeft, ChevronRight, Lightbulb, Megaphone, TriangleAlert, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { obtenerDb } from '../offline/db';
import { useLive } from '../offline/useLive';
import type { LocalComunicado, TipoComunicado } from '../offline/types';
import { paraMostrar } from './logica';

const ESTILO: Record<TipoComunicado, { icono: LucideIcon; caja: string; icono_c: string }> = {
  anuncio: { icono: Megaphone, caja: 'border-marca-200 bg-marca-50 dark:border-marca-900 dark:bg-marca-950/60', icono_c: 'text-marca-700 dark:text-marca-300' },
  descuento: { icono: BadgePercent, caja: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/50', icono_c: 'text-emerald-700 dark:text-emerald-300' },
  estrategia: { icono: Lightbulb, caja: 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900', icono_c: 'text-slate-600 dark:text-slate-300' },
  alerta: { icono: TriangleAlert, caja: 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50', icono_c: 'text-amber-700 dark:text-amber-300' },
};
export const estiloComunicado = (t: TipoComunicado) => ESTILO[t] ?? ESTILO.anuncio;

const CLAVE_CERRADOS = 'comunicados_cerrados';

/** Anuncios de la gerencia en la parte superior. Cada persona los cierra cuando los leyó (queda guardado en su dispositivo). */
export function BannerComunicados() {
  const db = obtenerDb();
  const todos = useLive(() => db.comunicados.toArray(), [], [] as LocalComunicado[]);
  const cerrados = useLive(() => db.leerMeta<string[]>(CLAVE_CERRADOS, []), [], [] as string[]);
  const visibles = useMemo(() => paraMostrar(todos).filter((c) => !cerrados.includes(c.id)), [todos, cerrados]);
  const [i, setI] = useState(0);
  const [abierto, setAbierto] = useState(false);
  if (visibles.length === 0) return null;
  const k = Math.min(i, visibles.length - 1);
  const c = visibles[k];
  const e = estiloComunicado(c.tipo);
  const Icono = e.icono;
  const largo = c.mensaje.length > 140;
  const cerrar = () => {
    void db.guardarMeta(CLAVE_CERRADOS, [...cerrados, c.id].slice(-200));
    setAbierto(false);
  };
  return (
    <section aria-label="Comunicados" aria-live="polite" className={`animate-in mb-4 flex gap-3 rounded-xl border p-3 ${e.caja}`}>
      <Icono className={`mt-0.5 h-5 w-5 shrink-0 ${e.icono_c}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{c.titulo}</p>
        {c.mensaje && (
          <p className={`mt-0.5 whitespace-pre-line text-sm text-slate-700 dark:text-slate-300 ${abierto ? '' : 'line-clamp-2'}`}>{c.mensaje}</p>
        )}
        {largo && (
          <button type="button" onClick={() => setAbierto((v) => !v)} className="mt-0.5 text-xs font-medium text-marca-700 hover:underline dark:text-marca-300">
            {abierto ? 'Ver menos' : 'Ver más'}
          </button>
        )}
      </div>
      <div className="flex shrink-0 items-start gap-0.5">
        {visibles.length > 1 && (
          <>
            <button type="button" aria-label="Comunicado anterior" onClick={() => { setI((k - 1 + visibles.length) % visibles.length); setAbierto(false); }} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-black/5 dark:hover:bg-white/10"><ChevronLeft className="h-4 w-4" /></button>
            <span className="pt-1.5 text-xs text-slate-500">{k + 1}/{visibles.length}</span>
            <button type="button" aria-label="Comunicado siguiente" onClick={() => { setI((k + 1) % visibles.length); setAbierto(false); }} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-black/5 dark:hover:bg-white/10"><ChevronRight className="h-4 w-4" /></button>
          </>
        )}
        <button type="button" aria-label="Cerrar este comunicado" onClick={cerrar} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-black/5 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
      </div>
    </section>
  );
}
