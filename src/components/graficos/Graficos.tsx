import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, ChevronRight, LineChart, Table2 } from 'lucide-react';

/*
 * Gráficos de NOVA. Cada forma según lo que muestra:
 *  - BarrasTendencia: cantidades por día (barras) y su promedio de 7 días (línea), en el MISMO eje y la misma unidad.
 *  - Linea: evolución en el tiempo (por día, por mes). Línea de 2px, área al 10%, cruz que sigue al cursor/dedo.
 *  - BarrasRanking: comparar y ordenar (representantes, productos).
 *  - Anillo: reparto de un total entre pocas partes (hasta 6), con leyenda y valores siempre visibles.
 *  - Medidor: una proporción contra un límite (cobertura, metas).
 * Color: `grafico` para una serie; `serie-1…6` para categorías, en orden fijo por entidad (nunca por posición en el
 * ranking). Los textos usan los tonos de texto, nunca el color de la serie. Todos tienen tabla o leyenda equivalente.
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

export interface PuntoSerie { clave: string; etiqueta: string; valor: number }

/** Promedio móvil de `n` períodos (los primeros usan los que haya). */
export function promedioMovil(valores: number[], n = 7): number[] {
  return valores.map((_, i) => {
    const tramo = valores.slice(Math.max(0, i - n + 1), i + 1);
    return tramo.reduce((a, v) => a + v, 0) / tramo.length;
  });
}

/** Columna con la punta superior redondeada (4px) y la base recta. */
function columna(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

/**
 * Barras por día y la línea de su promedio de 7 días (misma unidad, un solo eje). La barra señalada (o la del último
 * día) se resalta y una burbuja muestra sus valores; tocarla abre el detalle. "Ver tabla" lista todo.
 */
export function BarrasTendencia({ puntos, unidad, titulo, subtitulo, acciones, onSeleccionar }: { puntos: PuntoSerie[]; unidad: string; titulo: string; subtitulo?: string; acciones?: React.ReactNode; onSeleccionar?: (p: PuntoSerie) => void }) {
  const { ref, ancho } = useAncho<HTMLDivElement>();
  const [activo, setActivo] = useState<number | null>(null);
  const [tabla, setTabla] = useState(false);
  const ALTO = 190;
  const EJE_X = 24;
  const EJE_Y = 40;
  const ARRIBA = 44; // aire para la burbuja de lectura
  const promedio = useMemo(() => promedioMovil(puntos.map((p) => p.valor)), [puntos]);
  const max = ejeRedondo(Math.max(0, ...puntos.map((p) => p.valor), ...promedio));
  const plot = Math.max(0, ancho - EJE_Y - 4);
  const banda = puntos.length ? plot / puntos.length : 0;
  const w = Math.max(3, Math.min(24, banda * 0.62));
  const x = (i: number) => EJE_Y + i * banda + banda / 2;
  const y = (v: number) => ARRIBA + ALTO - (v / max) * ALTO;
  const ultimo = puntos.length - 1;
  const senal = activo ?? ultimo;
  const cadaCuanto = Math.max(1, Math.ceil(puntos.length / Math.max(3, Math.floor(plot / 70))));
  const trazo = promedio.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const fmtProm = (v: number) => v.toLocaleString('es-VE', { maximumFractionDigits: 1 });
  useEffect(() => setActivo(null), [puntos]);

  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="block text-base font-semibold text-slate-900 dark:text-white">{titulo}</span>
          {subtitulo && <span className="block text-xs text-slate-500">{subtitulo}</span>}
          <span className="mt-1.5 flex items-center gap-3 text-xs font-medium text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-barra" aria-hidden />Por día</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-linea" aria-hidden />Promedio 7 días</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {acciones}
          <button type="button" onClick={() => setTabla((t) => !t)} className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-slate-100 px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
            {tabla ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />} {tabla ? 'Ver gráfico' : 'Ver tabla'}
          </button>
        </div>
      </figcaption>
      {tabla ? (
        <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-950"><tr><th className="px-3 py-1.5 text-left font-medium">Período</th><th className="px-3 py-1.5 text-right font-medium">{unidad}</th><th className="px-3 py-1.5 text-right font-medium">Promedio 7 días</th></tr></thead>
            <tbody className="divide-y divide-slate-100 tabular-nums dark:divide-slate-800">
              {puntos.map((p, i) => ({ p, i })).reverse().map(({ p, i }) => (
                <tr key={p.clave} onClick={onSeleccionar ? () => onSeleccionar(p) : undefined} className={onSeleccionar ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800' : ''}>
                  <td className="px-3 py-1">{p.etiqueta}</td><td className="px-3 py-1 text-right">{formato(p.valor)}</td><td className="px-3 py-1 text-right">{fmtProm(promedio[i])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative" onPointerLeave={() => setActivo(null)}>
          {ancho > 0 && puntos.length > 0 && (
            <svg width={ancho} height={ARRIBA + ALTO + EJE_X} role="img" aria-label={`${titulo}: ${formato(puntos.reduce((a, p) => a + p.valor, 0))} ${unidad} en el período; promedio de 7 días al cierre ${fmtProm(promedio[ultimo])}`}>
              {[0, max / 2, max].map((v) => (
                <g key={v}>
                  <line x1={EJE_Y} x2={ancho} y1={y(v) + 0.5} y2={y(v) + 0.5} className="stroke-slate-100 dark:stroke-slate-800" strokeWidth={1} />
                  <text x={EJE_Y - 8} y={y(v) + 4} textAnchor="end" className="fill-slate-400 text-[11px] tabular-nums">{compacto(v)}</text>
                </g>
              ))}
              {puntos.map((p, i) => {
                const h = (p.valor / max) * ALTO;
                return h > 0 ? (
                  <path key={p.clave} d={columna(x(i) - w / 2, ARRIBA + ALTO - h, w, h)} className={`pointer-events-none transition-colors ${i === senal ? 'fill-barra-activa' : 'fill-barra'}`} />
                ) : null;
              })}
              <path d={trazo} fill="none" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" className="pointer-events-none stroke-linea" />
              <circle cx={x(senal)} cy={y(promedio[senal])} r={4.5} strokeWidth={2.5} className="pointer-events-none fill-white stroke-linea dark:fill-slate-900" />
              {puntos.map((p, i) => (
                <rect
                  key={p.clave}
                  x={EJE_Y + i * banda} y={ARRIBA} width={banda} height={ALTO} fill="transparent"
                  tabIndex={0} role="button" aria-label={`${p.etiqueta}: ${formato(p.valor)} ${unidad}, promedio de 7 días ${fmtProm(promedio[i])}`}
                  onPointerEnter={() => setActivo(i)} onPointerMove={() => setActivo(i)} onFocus={() => setActivo(i)} onBlur={() => setActivo(null)}
                  onClick={onSeleccionar ? () => onSeleccionar(p) : undefined}
                  onKeyDown={onSeleccionar ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSeleccionar(p); } } : undefined}
                  className={`${onSeleccionar ? 'cursor-pointer' : 'cursor-default'} focus:outline-none`}
                />
              ))}
              {puntos.map((p, i) =>
                (i % cadaCuanto === 0 && ultimo - i >= cadaCuanto * 0.7) || i === ultimo ? (
                  <text key={p.clave} x={x(i)} y={ARRIBA + ALTO + 17} textAnchor={i === 0 ? 'start' : i === ultimo ? 'end' : 'middle'} className={`text-[11px] ${i === senal ? 'fill-marca-800 font-semibold dark:fill-marca-300' : 'fill-slate-400'}`}>{p.etiqueta}</text>
                ) : null
              )}
            </svg>
          )}
          {puntos[senal] && ancho > 0 && (
            <div
              role="status"
              className="pointer-events-none absolute top-0 z-10 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-xl border border-slate-200/70 bg-white/95 px-3 py-1.5 text-xs shadow-elevada backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
              style={{ left: Math.min(Math.max(x(senal), 100), ancho - 100) }}
            >
              <span className="text-slate-500">{puntos[senal].etiqueta}</span>
              <span className="text-base font-bold text-slate-900 dark:text-white">{formato(puntos[senal].valor)}</span>
              <span className="text-slate-500">· prom. {fmtProm(promedio[senal])}</span>
              {onSeleccionar && <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden />}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

/** Tabla equivalente de una serie por período (la vista "Ver tabla"). */
function TablaSerie({ puntos, unidad, onSeleccionar }: { puntos: PuntoSerie[]; unidad: string; onSeleccionar?: (p: PuntoSerie) => void }) {
  return (
    <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-950"><tr><th className="px-3 py-1.5 text-left font-medium">Período</th><th className="px-3 py-1.5 text-right font-medium">{unidad}</th></tr></thead>
        <tbody className="divide-y divide-slate-100 tabular-nums dark:divide-slate-800">
          {[...puntos].reverse().map((p) => (
            <tr key={p.clave} onClick={onSeleccionar ? () => onSeleccionar(p) : undefined} className={onSeleccionar ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800' : ''}>
              <td className="px-3 py-1">{p.etiqueta}</td><td className="px-3 py-1 text-right">{formato(p.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Evolución en el tiempo (p. ej. unidades por día o por mes): línea de 2px con área suave, el último valor rotulado al
 * final y una cruz que sigue al cursor o al dedo con el valor del período. Tocar un período abre su detalle.
 */
export function Linea({ puntos, unidad, titulo, onSeleccionar }: { puntos: PuntoSerie[]; unidad: string; titulo: string; onSeleccionar?: (p: PuntoSerie) => void }) {
  const { ref, ancho } = useAncho<HTMLDivElement>();
  const [activo, setActivo] = useState<number | null>(null);
  const [tabla, setTabla] = useState(false);
  const ALTO = 160;
  const EJE_X = 22;
  const EJE_Y = 40;
  const ARRIBA = 18; // aire para el rótulo del último valor
  const max = ejeRedondo(Math.max(0, ...puntos.map((p) => p.valor)));
  const plot = Math.max(0, ancho - EJE_Y - 6);
  const banda = puntos.length ? plot / puntos.length : 0;
  const x = (i: number) => EJE_Y + i * banda + banda / 2;
  const y = (v: number) => ARRIBA + ALTO - (v / max) * ALTO;
  const marcasX = useMemo(() => (puntos.length ? [...new Set([0, Math.floor((puntos.length - 1) / 2), puntos.length - 1])] : []), [puntos.length]);
  useEffect(() => setActivo(null), [puntos]);
  const total = puntos.reduce((a, p) => a + p.valor, 0);
  const trazo = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join(' ');
  const area = puntos.length ? `${trazo} L${x(puntos.length - 1).toFixed(1)},${ARRIBA + ALTO} L${x(0).toFixed(1)},${ARRIBA + ALTO} Z` : '';
  const ultimo = puntos.length - 1;
  const conPuntero = activo ?? ultimo;

  return (
    <figure className="m-0">
      <figcaption className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900 dark:text-white">{titulo}</span>
        <button type="button" onClick={() => setTabla((t) => !t)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
          {tabla ? <LineChart className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />} {tabla ? 'Ver gráfico' : 'Ver tabla'}
        </button>
      </figcaption>
      {tabla ? (
        <TablaSerie puntos={puntos} unidad={unidad} onSeleccionar={onSeleccionar} />
      ) : (
        <div ref={ref} className="relative" onPointerLeave={() => setActivo(null)}>
          {ancho > 0 && puntos.length > 0 && (
            <svg width={ancho} height={ARRIBA + ALTO + EJE_X} role="img" aria-label={`${titulo}: ${formato(total)} ${unidad} en total; último período ${puntos[ultimo].etiqueta}, ${formato(puntos[ultimo].valor)}`}>
              {[0, max / 2, max].map((v) => (
                <g key={v}>
                  <line x1={EJE_Y} x2={ancho} y1={y(v) + 0.5} y2={y(v) + 0.5} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth={1} />
                  <text x={EJE_Y - 6} y={y(v) + 4} textAnchor="end" className="fill-slate-500 text-[11px] tabular-nums">{compacto(v)}</text>
                </g>
              ))}
              <path d={area} className="pointer-events-none fill-grafico/10" />
              <path d={trazo} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="pointer-events-none stroke-grafico" />
              {activo !== null && <line x1={x(activo)} x2={x(activo)} y1={ARRIBA} y2={ARRIBA + ALTO} className="pointer-events-none stroke-slate-300 dark:stroke-slate-600" strokeWidth={1} />}
              {/* Punto del período activo (o del último), con anillo del color del fondo para que se lea sobre la línea. */}
              <circle cx={x(conPuntero)} cy={y(puntos[conPuntero].valor)} r={4} strokeWidth={2} className="pointer-events-none fill-grafico stroke-white dark:stroke-slate-900" />
              {activo === null && (
                <text x={Math.min(x(ultimo), ancho - 2)} y={y(puntos[ultimo].valor) - 9} textAnchor="end" className="pointer-events-none fill-slate-700 text-[11px] font-semibold tabular-nums dark:fill-slate-200">{formato(puntos[ultimo].valor)}</text>
              )}
              {puntos.map((p, i) => (
                // Zona sensible: toda la franja del período (mucho más grande que el punto).
                <rect
                  key={p.clave}
                  x={EJE_Y + i * banda} y={ARRIBA} width={banda} height={ALTO} fill="transparent"
                  tabIndex={0} role="button" aria-label={`${p.etiqueta}: ${formato(p.valor)} ${unidad}`}
                  onPointerEnter={() => setActivo(i)} onPointerMove={() => setActivo(i)} onFocus={() => setActivo(i)} onBlur={() => setActivo(null)}
                  onClick={onSeleccionar ? () => onSeleccionar(p) : undefined}
                  onKeyDown={onSeleccionar ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSeleccionar(p); } } : undefined}
                  className={`${onSeleccionar ? 'cursor-pointer' : 'cursor-default'} focus:outline-none`}
                />
              ))}
              {marcasX.map((i) => (
                <text key={i} x={x(i)} y={ARRIBA + ALTO + 16} textAnchor={i === 0 ? 'start' : i === ultimo ? 'end' : 'middle'} className="fill-slate-500 text-[11px]">{puntos[i].etiqueta}</text>
              ))}
            </svg>
          )}
          {activo !== null && puntos[activo] && (
            <div
              role="status"
              className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-xl dark:border-slate-700 dark:bg-slate-900"
              style={{ left: Math.min(Math.max(x(activo), 70), ancho - 70) }}
            >
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{formato(puntos[activo].valor)} {unidad}</p>
              <p className="text-slate-500">{puntos[activo].etiqueta}{onSeleccionar ? ' · toca para ver' : ''}</p>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

/** Clases por color de categoría (nombres completos para que Tailwind las genere). */
const TRAZO_SERIE = ['stroke-serie-1', 'stroke-serie-2', 'stroke-serie-3', 'stroke-serie-4', 'stroke-serie-5', 'stroke-serie-6'];
const FONDO_SERIE = ['bg-serie-1', 'bg-serie-2', 'bg-serie-3', 'bg-serie-4', 'bg-serie-5', 'bg-serie-6'];
export const MAX_PARTES_ANILLO = TRAZO_SERIE.length;

export interface ParteAnillo { clave: string; nombre: string; valor: number; /** Posición fija de la entidad (0–5): su color. */ color: number }

/**
 * Reparto de un total entre pocas partes (p. ej. unidades del mes por droguería). El centro dice el total (o la parte
 * resaltada); la leyenda muestra cada parte con su valor y su porcentaje, y tocarla abre el detalle.
 */
export function Anillo({ partes, unidad, onSeleccionar }: { partes: ParteAnillo[]; unidad: string; onSeleccionar?: (clave: string) => void }) {
  const [activa, setActiva] = useState<string | null>(null);
  const total = partes.reduce((a, p) => a + p.valor, 0);
  const TAM = 168;
  const R = 70;
  const GROSOR = 20;
  const C = 2 * Math.PI * R;
  const HUECO = partes.length > 1 ? 2 : 0; // 2px del color del fondo entre partes
  let inicio = 0;
  const arcos = partes.map((p) => {
    const largo = total > 0 ? (p.valor / total) * C : 0;
    const arco = { ...p, desde: inicio, visible: Math.max(0, largo - HUECO) };
    inicio += largo;
    return arco;
  });
  const resaltada = partes.find((p) => p.clave === activa) ?? null;
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center" onPointerLeave={() => setActiva(null)}>
      <div className="relative shrink-0" style={{ width: TAM, height: TAM }}>
        <svg width={TAM} height={TAM} viewBox={`0 0 ${TAM} ${TAM}`} role="img" aria-label={`Total ${formato(total)} ${unidad}: ${partes.map((p) => `${p.nombre} ${formato(p.valor)} (${pct(p.valor)}%)`).join(', ')}`}>
          <g transform={`rotate(-90 ${TAM / 2} ${TAM / 2})`}>
            {arcos.map((a) =>
              a.visible > 0 ? (
                <circle
                  key={a.clave}
                  cx={TAM / 2} cy={TAM / 2} r={R} fill="none" strokeWidth={GROSOR}
                  strokeDasharray={`${a.visible} ${C - a.visible}`} strokeDashoffset={-(a.desde + HUECO / 2)}
                  className={`${TRAZO_SERIE[a.color % TRAZO_SERIE.length]} transition-opacity ${activa && activa !== a.clave ? 'opacity-40' : ''} ${onSeleccionar ? 'cursor-pointer' : ''}`}
                  style={{ pointerEvents: 'stroke' }}
                  onPointerEnter={() => setActiva(a.clave)}
                  onClick={onSeleccionar ? () => onSeleccionar(a.clave) : undefined}
                />
              ) : null
            )}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <span className="text-xl font-semibold text-slate-900 dark:text-white">{formato(resaltada ? resaltada.valor : total)}</span>
          <span className="line-clamp-2 text-xs text-slate-500">{resaltada ? `${resaltada.nombre} · ${pct(resaltada.valor)}%` : `${unidad} en total`}</span>
        </div>
      </div>
      <ul className="flex w-full min-w-0 flex-col gap-1">
        {partes.map((p) => {
          const fila = (
            <>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${FONDO_SERIE[p.color % FONDO_SERIE.length]}`} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{p.nombre}</span>
              <span className="shrink-0 text-sm font-medium tabular-nums text-slate-900 dark:text-white">{formato(p.valor)}</span>
              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-500">{pct(p.valor)}%</span>
            </>
          );
          const clases = `flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${activa === p.clave ? 'bg-slate-100 dark:bg-slate-800' : ''}`;
          return (
            <li key={p.clave} onPointerEnter={() => setActiva(p.clave)}>
              {onSeleccionar ? (
                <button type="button" onClick={() => onSeleccionar(p.clave)} onFocus={() => setActiva(p.clave)} onBlur={() => setActiva(null)} aria-label={`${p.nombre}: ${formato(p.valor)} ${unidad}, ${pct(p.valor)}%. Ver detalle`} className={`${clases} hover:bg-slate-50 dark:hover:bg-slate-800`}>{fila}</button>
              ) : (
                <div className={clases}>{fila}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Ranking en barras horizontales: nombre y valor arriba, barra debajo a lo ancho (se lee igual en móvil y en PC). */
export function BarrasRanking({ filas, unidad, vacio, onSeleccionar }: { filas: { clave: string; nombre: string; valor: number }[]; unidad: string; vacio: string; onSeleccionar?: (clave: string) => void }) {
  if (filas.length === 0) return <p className="py-6 text-center text-sm text-slate-500">{vacio}</p>;
  const max = Math.max(...filas.map((f) => f.valor), 1);
  return (
    <ol className="flex flex-col gap-3">
      {filas.map((f) => (
        <li key={f.clave} title={`${f.nombre}: ${formato(f.valor)} ${unidad}`}>
          {(() => {
            const fila = (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm text-slate-700 dark:text-slate-200">{f.nombre}</span>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-slate-900 dark:text-white">{formato(f.valor)}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden><div className="h-full rounded-full bg-barra-activa" style={{ width: `${Math.max(1, (f.valor / max) * 100)}%` }} /></div>
              </>
            );
            return onSeleccionar ? (
              <button type="button" onClick={() => onSeleccionar(f.clave)} aria-label={`${f.nombre}: ${formato(f.valor)} ${unidad}. Ver detalle`} className="-mx-1 block w-[calc(100%+0.5rem)] rounded-lg px-1 py-0.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800">{fila}</button>
            ) : fila;
          })()}
        </li>
      ))}
    </ol>
  );
}

/** Medidor de avance (p. ej. cobertura del fichero): la pista es un tono claro de la misma marca. */
export function Medidor({ valor, total, rotulo, nota, onClick }: { valor: number; total: number; rotulo: string; nota?: string; onClick?: () => void }) {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0;
  const Caja = onClick ? 'button' : 'div';
  return (
    <Caja {...(onClick ? { type: 'button' as const, onClick, 'aria-label': `${rotulo}: ${pct}%. Ver detalle` } : {})} className={onClick ? '-m-1 block w-[calc(100%+0.5rem)] rounded-lg p-1 text-left hover:bg-slate-50 dark:hover:bg-slate-800' : ''}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{rotulo}</p>
        <p className="text-sm text-slate-500"><span className="text-lg font-semibold text-slate-900 dark:text-white">{pct}%</span> · {formato(valor)} de {formato(total)}</p>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-marca-100 dark:bg-marca-950" role="meter" aria-valuemin={0} aria-valuemax={total} aria-valuenow={valor} aria-label={rotulo}>
        <div className="h-full rounded-full bg-grafico" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      {nota && <p className="mt-1.5 text-xs text-slate-500">{nota}</p>}
    </Caja>
  );
}
