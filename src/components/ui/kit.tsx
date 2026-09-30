import React, { useEffect, useState } from 'react';
import { Check, Minus, Plus, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Piezas de interfaz de NOVA. Las reglas del sistema de diseño están en src/index.css: un color de marca, neutros slate,
 * semánticos solo para estados, radio 8px en controles y 12px en tarjetas, tarjetas planas y sombra solo en lo que flota.
 * Todas las pantallas deben construirse con estas piezas en lugar de clases sueltas.
 */

// ---------------------------------------------------------------------------- campos

export const estiloInput =
  'w-full min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-marca-600 focus:outline-none focus:ring-2 focus:ring-marca-600/20 disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800';

/** Campo con rótulo arriba y ayuda o error abajo. */
export function Campo({ rotulo, ayuda, error, children, className = '' }: { rotulo: string; ayuda?: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">{rotulo}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-rose-700 dark:text-rose-400">{error}</span> : ayuda ? <span className="mt-1 block text-xs text-slate-500">{ayuda}</span> : null}
    </label>
  );
}

// ---------------------------------------------------------------------------- estructura

export function PageHeader({ titulo, descripcion, acciones }: { titulo: string; descripcion?: string; acciones?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold leading-tight text-slate-900 dark:text-white">{titulo}</h1>
        {descripcion && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  );
}

export function Tarjeta({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 ${className}`}>{children}</div>;
}

/** Título de sección dentro de una tarjeta o página. */
export function Subtitulo({ children, accion }: { children: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{children}</h2>
      {accion}
    </div>
  );
}

// ---------------------------------------------------------------------------- etiquetas

const TONOS = {
  neutro: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  marca: 'bg-marca-50 text-marca-800 dark:bg-marca-950 dark:text-marca-300',
  exito: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  aviso: 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  peligro: 'bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
} as const;
/** Nombres anteriores de los tonos (se conservan para no romper pantallas). */
const ALIAS_TONO = { gris: 'neutro', verde: 'exito', ambar: 'aviso', rojo: 'peligro', azul: 'marca', teal: 'marca' } as const;
export type Tono = keyof typeof TONOS | keyof typeof ALIAS_TONO;
const clasesTono = (t: Tono) => TONOS[(ALIAS_TONO as Record<string, keyof typeof TONOS>)[t] ?? (t as keyof typeof TONOS)];

export function Etiqueta({ tono = 'neutro', children }: { tono?: Tono; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${clasesTono(tono)}`}>{children}</span>;
}

// ---------------------------------------------------------------------------- botones

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro' | 'suave';
const VARIANTES: Record<Variante, string> = {
  primario: 'bg-marca-700 text-white hover:bg-marca-800 disabled:bg-marca-700/50',
  secundario: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800',
  fantasma: 'text-marca-700 hover:bg-marca-50 dark:text-marca-300 dark:hover:bg-marca-950',
  peligro: 'bg-rose-700 text-white hover:bg-rose-800 disabled:bg-rose-700/50',
  suave: 'text-marca-700 hover:bg-marca-50 dark:text-marca-300 dark:hover:bg-marca-950',
};
const TAMANOS = { md: 'min-h-10 px-4 text-sm', sm: 'min-h-8 px-3 text-xs' } as const;

export function Boton({
  variante = 'secundario',
  tamano = 'md',
  icono: Icono,
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; tamano?: keyof typeof TAMANOS; icono?: LucideIcon }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${TAMANOS[tamano]} ${VARIANTES[variante]} ${className}`}
    >
      {Icono && <Icono className="h-4 w-4 shrink-0" aria-hidden />}
      {children}
    </button>
  );
}

/** Botón de solo icono (con nombre accesible). */
export function BotonIcono({ icono: Icono, etiqueta, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icono: LucideIcon; etiqueta: string }) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      {...props}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800 ${className}`}
    >
      <Icono className="h-5 w-5" aria-hidden />
    </button>
  );
}

/** Selector de secciones (pestañas). Se desplaza en horizontal si no cabe. */
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
    <div role="tablist" className="mb-4 flex max-w-full gap-1 overflow-x-auto border-b border-slate-200 scrollbar-none dark:border-slate-800">
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={valor === o.id}
          onClick={() => onChange(o.id)}
          className={`-mb-px min-h-10 shrink-0 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors ${
            valor === o.id ? 'border-marca-700 text-marca-800 dark:border-marca-400 dark:text-marca-300' : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          {o.texto}
          {o.cuenta !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{o.cuenta}</span>}
        </button>
      ))}
    </div>
  );
}

/** Chips de filtro (una sola opción activa). */
export function Filtros<T extends string>({ opciones, valor, onChange }: { opciones: { id: T; texto: string }[]; valor: T; onChange: (id: T) => void }) {
  return (
    <div className="flex max-w-full gap-2 overflow-x-auto scrollbar-none">
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={valor === o.id}
          onClick={() => onChange(o.id)}
          className={`min-h-8 shrink-0 whitespace-nowrap rounded-lg border px-3 text-xs font-medium transition-colors ${
            valor === o.id
              ? 'border-marca-700 bg-marca-700 text-white'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------- datos

export function Vacio({ icono: Icono, titulo, texto, accion }: { icono?: LucideIcon; titulo: string; texto?: string; accion?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      {Icono && <Icono className="h-8 w-8 text-slate-300 dark:text-slate-600" aria-hidden />}
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{titulo}</p>
      {texto && <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">{texto}</p>}
      {accion}
    </div>
  );
}

/** Variación vs. un período anterior: ↑ 12% (verde si subir es bueno). */
export function Variacion({ pct, periodo, subirEsBueno = true }: { pct: number | null; periodo: string; subirEsBueno?: boolean }) {
  if (pct === null) return <span className="text-slate-500">Sin datos de {periodo}</span>;
  const bueno = pct === 0 ? null : (pct > 0) === subirEsBueno;
  const color = bueno === null ? 'text-slate-500' : bueno ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400';
  return <span><span className={`font-medium ${color}`}>{pct > 0 ? '↑' : pct < 0 ? '↓' : '='} {Math.abs(pct)}%</span> <span className="text-slate-500">vs {periodo}</span></span>;
}

/** Indicador: rótulo, cifra y (opcional) variación o nota. */
export function Dato({ rotulo, valor, tono, nota, icono: Icono }: { rotulo: string; valor: React.ReactNode; tono?: Tono; nota?: React.ReactNode; icono?: LucideIcon }) {
  const t = tono ? (ALIAS_TONO as Record<string, string>)[tono] ?? tono : undefined;
  const color = t === 'peligro' ? 'text-rose-700 dark:text-rose-400' : t === 'aviso' ? 'text-amber-700 dark:text-amber-400' : t === 'exito' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-white';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
        {Icono && <Icono className="h-3.5 w-3.5" aria-hidden />}
        {rotulo}
      </p>
      <p className={`mt-1 text-2xl font-semibold leading-tight ${color}`}>{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{nota}</p>}
    </div>
  );
}

/** Iniciales o foto. Sirve para personas y, con `cuadrado`, para productos. */
export function Avatar({ nombre, foto, tamano = 40, cuadrado = false }: { nombre: string; foto?: string | null; tamano?: number; cuadrado?: boolean }) {
  const [fallo, setFallo] = useState(false);
  // Personas: iniciales de nombre y apellido. Productos (cuadrado): las dos primeras letras del nombre ("Losartán 50" -> LO).
  const iniciales = (cuadrado
    ? nombre.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '').slice(0, 2)
    : nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('')).toUpperCase() || '?';
  const forma = cuadrado ? 'rounded-lg' : 'rounded-full';
  const estilo = { width: tamano, height: tamano, fontSize: Math.max(11, Math.round(tamano * 0.36)) };
  if (foto && !fallo) {
    return <img src={foto} alt="" loading="lazy" onError={() => setFallo(true)} style={estilo} className={`${forma} shrink-0 border border-slate-200 bg-white object-cover dark:border-slate-700`} />;
  }
  return (
    <span aria-hidden style={estilo} className={`${forma} inline-flex shrink-0 items-center justify-center bg-marca-50 font-semibold text-marca-800 dark:bg-marca-950 dark:text-marca-300`}>
      {iniciales}
    </span>
  );
}

// ---------------------------------------------------------------------------- selección

/** Casilla de selección (también en estado "algunos" para "seleccionar todo"). */
export function Casilla({ marcada, parcial = false, onChange, etiqueta }: { marcada: boolean; parcial?: boolean; onChange: (v: boolean) => void; etiqueta: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={parcial ? 'mixed' : marcada}
      aria-label={etiqueta}
      onClick={(e) => { e.stopPropagation(); onChange(!marcada); }}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center"
    >
      <span className={`inline-flex h-5 w-5 items-center justify-center rounded border transition-colors ${marcada || parcial ? 'border-marca-700 bg-marca-700 text-white' : 'border-slate-400 bg-white dark:border-slate-600 dark:bg-slate-900'}`}>
        {parcial ? <Minus className="h-3.5 w-3.5" /> : marcada ? <Check className="h-3.5 w-3.5" /> : null}
      </span>
    </button>
  );
}

/** Barra que aparece al seleccionar registros: cuántos hay y las acciones sobre todos. */
export function BarraSeleccion({ cantidad, onLimpiar, children }: { cantidad: number; onLimpiar: () => void; children: React.ReactNode }) {
  if (cantidad === 0) return null;
  return (
    <div role="region" aria-label="Acciones sobre la selección" className="animate-in sticky top-14 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-marca-200 bg-marca-50 px-3 py-2 dark:border-marca-900 dark:bg-marca-950">
      <span className="text-sm font-semibold text-marca-900 dark:text-marca-200">{cantidad} seleccionado{cantidad === 1 ? '' : 's'}</span>
      <Boton tamano="sm" variante="fantasma" icono={X} onClick={onLimpiar}>Quitar selección</Boton>
      <div className="ml-auto flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** Selección de un conjunto de ids (con "seleccionar todo lo visible"). */
export function useSeleccion() {
  const [ids, setIds] = useState<Set<string>>(new Set());
  return {
    ids,
    cantidad: ids.size,
    tiene: (id: string) => ids.has(id),
    alternar: (id: string) => setIds((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    fijarTodos: (lista: string[], marcar: boolean) => setIds((p) => { const n = new Set(p); lista.forEach((id) => (marcar ? n.add(id) : n.delete(id))); return n; }),
    limpiar: () => setIds(new Set()),
  };
}

// ---------------------------------------------------------------------------- cantidades

/** − cantidad + : para unidades. Escribir la cifra también funciona. */
export function PasoUnidades({ valor, onChange, paso = 1, min = 0, etiqueta = 'Unidades', compacto = false }: { valor: number; onChange: (n: number) => void; paso?: number; min?: number; etiqueta?: string; compacto?: boolean }) {
  const alto = compacto ? 'h-8' : 'h-10';
  return (
    <div className={`inline-flex ${alto} items-stretch overflow-hidden rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900`}>
      <button type="button" aria-label={`Quitar ${paso}`} onClick={() => onChange(Math.max(min, valor - paso))} className={`inline-flex ${compacto ? 'w-8' : 'w-9'} items-center justify-center text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800`}>
        <Minus className="h-4 w-4" />
      </button>
      <input
        inputMode="numeric"
        aria-label={etiqueta}
        value={valor}
        onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ''), 10); onChange(Number.isFinite(n) ? Math.max(min, n) : min); }}
        className={`${compacto ? 'w-10' : 'w-12'} border-x border-slate-200 bg-transparent text-center text-sm font-semibold tabular-nums focus:outline-none dark:border-slate-700`}
      />
      <button type="button" aria-label={`Sumar ${paso}`} onClick={() => onChange(valor + paso)} className={`inline-flex ${compacto ? 'w-8' : 'w-9'} items-center justify-center text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800`}>
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------- avisos y confirmación

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
      className={`animate-in mb-3 flex items-start justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
        aviso.tipo === 'ok'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
          : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200'
      }`}
    >
      <span>{aviso.texto}</span>
      <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso" className="-m-1 p-1 opacity-60 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  ) : null;
  return { mostrar: setAviso, nodo };
}

/** Diálogo de confirmación (reemplaza a window.confirm). Devuelve el nodo y una función que resuelve true/false. */
export function useConfirmar() {
  const [pedido, setPedido] = useState<{ titulo: string; texto: string; accion: string; peligro: boolean; resolver: (v: boolean) => void } | null>(null);
  const confirmar = (titulo: string, texto: string, opciones: { accion?: string; peligro?: boolean } = {}) =>
    new Promise<boolean>((resolver) => setPedido({ titulo, texto, accion: opciones.accion ?? 'Aceptar', peligro: opciones.peligro ?? false, resolver }));
  const cerrar = (v: boolean) => {
    pedido?.resolver(v);
    setPedido(null);
  };
  const nodo = pedido ? (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4" role="alertdialog" aria-modal="true" aria-labelledby="confirmar-titulo">
      <div className="animate-in w-full rounded-t-xl bg-white p-5 shadow-xl dark:bg-slate-900 sm:max-w-md sm:rounded-xl">
        <h2 id="confirmar-titulo" className="text-base font-semibold text-slate-900 dark:text-white">{pedido.titulo}</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{pedido.texto}</p>
        <div className="mt-5 flex justify-end gap-2 pb-safe">
          <Boton onClick={() => cerrar(false)}>Cancelar</Boton>
          <Boton variante={pedido.peligro ? 'peligro' : 'primario'} onClick={() => cerrar(true)} autoFocus>{pedido.accion}</Boton>
        </div>
      </div>
    </div>
  ) : null;
  return { confirmar, nodo };
}
