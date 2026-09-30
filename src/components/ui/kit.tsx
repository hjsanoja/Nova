import React, { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Piezas de interfaz compartidas: compactas por defecto (poco alto, sin adornos) y táctiles en móvil. */

export const estiloInput =
  'w-full min-h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

export function PageHeader({ titulo, descripcion, acciones }: { titulo: string; descripcion?: string; acciones?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-bold leading-tight text-slate-900 dark:text-white">{titulo}</h1>
        {descripcion && <p className="text-xs text-slate-500 dark:text-slate-400">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  );
}

export function Tarjeta({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-900 ${className}`}>{children}</div>;
}

const TONOS = {
  gris: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  verde: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  ambar: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  rojo: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  azul: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  teal: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
} as const;
export type Tono = keyof typeof TONOS;

export function Etiqueta({ tono = 'gris', children }: { tono?: Tono; children: React.ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONOS[tono]}`}>{children}</span>;
}

/** Selector de secciones: reemplaza a las barras de pestañas grandes. Se desplaza en horizontal si no cabe. */
export function Segmentado<T extends string>({
  opciones,
  valor,
  onChange,
}: {
  opciones: { id: T; texto: string; cuenta?: number }[];
  valor: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" className="mb-3 flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 scrollbar-none dark:bg-slate-800/70">
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={valor === o.id}
          onClick={() => onChange(o.id)}
          className={`min-h-9 shrink-0 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors ${
            valor === o.id ? 'bg-white text-teal-700 shadow-sm dark:bg-slate-900 dark:text-teal-300' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          {o.texto}
          {o.cuenta !== undefined && <span className="ml-1.5 text-xs font-bold opacity-60">{o.cuenta}</span>}
        </button>
      ))}
    </div>
  );
}

type Variante = 'primario' | 'secundario' | 'peligro' | 'suave';
const VARIANTES: Record<Variante, string> = {
  primario: 'bg-teal-600 text-white hover:bg-teal-700 disabled:bg-teal-600/50',
  secundario: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
  peligro: 'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-600/50',
  suave: 'text-teal-700 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-950/50',
};

export function Boton({
  variante = 'secundario',
  icono: Icono,
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; icono?: LucideIcon }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${VARIANTES[variante]} ${className}`}
    >
      {Icono && <Icono className="h-4 w-4 shrink-0" />}
      {children}
    </button>
  );
}

export function Vacio({ icono: Icono, titulo, texto, accion }: { icono?: LucideIcon; titulo: string; texto?: string; accion?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      {Icono && <Icono className="h-8 w-8 text-slate-300 dark:text-slate-600" />}
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{titulo}</p>
      {texto && <p className="max-w-sm text-xs text-slate-500 dark:text-slate-400">{texto}</p>}
      {accion}
    </div>
  );
}

/** Cifra + rótulo, en una línea de alto mínimo. */
export function Dato({ rotulo, valor, tono }: { rotulo: string; valor: React.ReactNode; tono?: Tono }) {
  const color = tono === 'rojo' ? 'text-rose-600 dark:text-rose-400' : tono === 'ambar' ? 'text-amber-600 dark:text-amber-400' : tono === 'verde' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white';
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{rotulo}</p>
      <p className={`text-2xl font-bold leading-tight ${color}`}>{valor}</p>
    </div>
  );
}

export function useDebounced<T>(valor: T, ms = 200): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

/** Aviso breve (éxito/error) que se cierra solo. */
export function useAviso() {
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 5000);
    return () => clearTimeout(t);
  }, [aviso]);
  const nodo = aviso ? (
    <div
      role="status"
      className={`mb-3 flex items-start justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${
        aviso.tipo === 'ok'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
          : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
      }`}
    >
      <span>{aviso.texto}</span>
      <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso" className="-m-1 p-1 opacity-60 hover:opacity-100">
        ×
      </button>
    </div>
  ) : null;
  return { mostrar: setAviso, nodo };
}
