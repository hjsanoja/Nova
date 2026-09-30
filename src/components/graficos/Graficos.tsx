import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Table2, BarChart3 } from 'lucide-react';

/*
 * Gráficos de NOVA (una sola serie): marca-600 para las marcas (validado en claro y oscuro), textos con los tonos de
 * texto (nunca con el color de la serie), rejilla fina y sólida, columnas de hasta 24px con punta redondeada de 4px y
 * base recta, ayuda al pasar el cursor o enfocar con el teclado, y una vista de tabla equivalente.
 */

const formato = (n: number) => n.toLocaleString('es-VE');
const compacto = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)} mil` : n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')} mil` : String(n));

/** Máximo "redondo" para el eje (1, 2, 5 × 10^n) con tres marcas: 0, mitad y máximo. */
function ejeRedondo(max: number): number {
  if (max <= 0) return 4;
  const base = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (max <= m * base) return m * base;
  return 10 * base;
}

function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    setAncho(ref.current.clientWidth);
    const obs = new ResizeObserver(([e]) => setAncho(e.contentRect.width));
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return { ref, ancho };
}

/** Rectángulo con la punta superior redondeada (4px) y la base recta. */
function columna(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

export interface PuntoSerie { clave: string; etiqueta: string; valor: number }

/** Columnas por período (p. ej. unidades por día). Tocar o pasar el cursor muestra el valor; "Ver tabla" lo lista. */
export function Columnas({ puntos, unidad, titulo }: { puntos: PuntoSerie[]; unidad: string; titulo: string }) {
  const { ref, ancho } = useAncho<HTMLDivElement>();
  const [activo, setActivo] = useState<number | null>(null);
  const [tabla, setTabla] = useState(false);
  const ALTO = 160;
  const EJE_X = 22;
  const EJE_Y = 40;
  const ARRIBA = 8; // aire para que la marca superior del eje no se corte
  const max = ejeRedondo(Math.max(0, ...puntos.map((p) => p.valor)));
  const plot = Math.max(0, ancho - EJE_Y);
  const banda = puntos.length ? plot / puntos.length : 0;
  const w = Math.max(2, Math.min(24, banda - 2));
  const y = (v: number) => ARRIBA + ALTO - (v / max) * ALTO;
  const marcasX = useMemo(() => (puntos.length ? [0, Math.floor((puntos.length - 1) / 2), puntos.length - 1] : []), [puntos.length]);
  useEffect(() => setActivo(null), [puntos]);
  const total = puntos.reduce((a, p) => a + p.valor, 0);

  return (
    <figure className="m-0">
      <figcaption className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900 dark:text-white">{titulo}</span>
        <button type="button" onClick={() => setTabla((t) => !t)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
          {tabla ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />} {tabla ? 'Ver gráfico' : 'Ver tabla'}
        </button>
      </figcaption>
      {tabla ? (
        <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-950"><tr><th className="px-3 py-1.5 text-left font-medium">Fecha</th><th className="px-3 py-1.5 text-right font-medium">{unidad}</th></tr></thead>
            <tbody className="divide-y divide-slate-100 tabular-nums dark:divide-slate-800">
              {[...puntos].reverse().map((p) => <tr key={p.clave}><td className="px-3 py-1">{p.etiqueta}</td><td className="px-3 py-1 text-right">{formato(p.valor)}</td></tr>)}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative" onPointerLeave={() => setActivo(null)}>
          {ancho > 0 && (
            <svg width={ancho} height={ARRIBA + ALTO + EJE_X} role="img" aria-label={`${titulo}: ${formato(total)} ${unidad} en total`}>
              {[0, max / 2, max].map((v) => (
                <g key={v}>
                  <line x1={EJE_Y} x2={ancho} y1={y(v) + 0.5} y2={y(v) + 0.5} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth={1} />
                  <text x={EJE_Y - 6} y={y(v) + 4} textAnchor="end" className="fill-slate-500 text-[11px] tabular-nums">{compacto(v)}</text>
                </g>
              ))}
              {puntos.map((p, i) => {
                const x = EJE_Y + i * banda + (banda - w) / 2;
                const h = (p.valor / max) * ALTO;
                return (
                  <g key={p.clave}>
                    {/* Zona sensible: toda la banda (más grande que la columna). */}
                    <rect
                      x={EJE_Y + i * banda} y={ARRIBA} width={banda} height={ALTO} fill="transparent"
                      tabIndex={0} role="button" aria-label={`${p.etiqueta}: ${formato(p.valor)} ${unidad}`}
                      onPointerEnter={() => setActivo(i)} onFocus={() => setActivo(i)} onBlur={() => setActivo(null)}
                      className="cursor-default focus:outline-none"
                    />
                    {h > 0 && <path d={columna(x, ARRIBA + ALTO - h, w, h)} className={`pointer-events-none fill-marca-600 ${activo !== null && activo !== i ? 'opacity-50' : ''}`} />}
                  </g>
                );
              })}
              {marcasX.map((i) => (
                <text key={i} x={EJE_Y + i * banda + banda / 2} y={ARRIBA + ALTO + 16} textAnchor={i === 0 ? 'start' : i === puntos.length - 1 ? 'end' : 'middle'} className="fill-slate-500 text-[11px]">{puntos[i].etiqueta}</text>
              ))}
            </svg>
          )}
          {activo !== null && puntos[activo] && (
            <div
              role="status"
              className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-xl dark:border-slate-700 dark:bg-slate-900"
              style={{ left: Math.min(Math.max(EJE_Y + activo * banda + banda / 2, 60), ancho - 60) }}
            >
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{formato(puntos[activo].valor)} {unidad}</p>
              <p className="text-slate-500">{puntos[activo].etiqueta}</p>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

/** Ranking en barras horizontales: nombre y valor arriba, barra debajo a lo ancho (se lee igual en móvil y en PC). */
export function BarrasRanking({ filas, unidad, vacio }: { filas: { clave: string; nombre: string; valor: number }[]; unidad: string; vacio: string }) {
  if (filas.length === 0) return <p className="py-6 text-center text-sm text-slate-500">{vacio}</p>;
  const max = Math.max(...filas.map((f) => f.valor), 1);
  return (
    <ol className="flex flex-col gap-3">
      {filas.map((f) => (
        <li key={f.clave} title={`${f.nombre}: ${formato(f.valor)} ${unidad}`}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm text-slate-700 dark:text-slate-200">{f.nombre}</span>
            <span className="shrink-0 text-sm font-medium tabular-nums text-slate-900 dark:text-white">{formato(f.valor)}</span>
          </div>
          <div className="mt-1 h-2 rounded-r bg-marca-600" style={{ width: `${Math.max(1, (f.valor / max) * 100)}%` }} aria-hidden />
        </li>
      ))}
    </ol>
  );
}

/** Medidor de avance (p. ej. cobertura del fichero): la pista es un tono claro de la misma marca. */
export function Medidor({ valor, total, rotulo, nota }: { valor: number; total: number; rotulo: string; nota?: string }) {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{rotulo}</p>
        <p className="text-sm text-slate-500"><span className="text-lg font-semibold text-slate-900 dark:text-white">{pct}%</span> · {formato(valor)} de {formato(total)}</p>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-marca-100 dark:bg-marca-950" role="meter" aria-valuemin={0} aria-valuemax={total} aria-valuenow={valor} aria-label={rotulo}>
        <div className="h-full rounded-full bg-marca-600" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      {nota && <p className="mt-1.5 text-xs text-slate-500">{nota}</p>}
    </div>
  );
}
