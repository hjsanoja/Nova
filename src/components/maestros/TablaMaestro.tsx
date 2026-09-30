import React, { useDeferredValue, useMemo, useRef, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BarraSeleccion, Boton, Casilla, Tarjeta, Vacio, estiloInput, useSeleccion } from '../ui/kit';
import { normalizarBusqueda } from '../../services/maestros';

export interface Columna<T> {
  titulo: string;
  celda: (fila: T) => React.ReactNode;
  /** Se oculta en pantallas angostas (queda la información principal). */
  secundaria?: boolean;
  alinear?: 'derecha';
}

const POR_PAGINA = 100;

/**
 * Tabla de datos maestros: búsqueda, selección múltiple (una, varias o todas las filtradas), borrado en bloque y
 * paginación. Tocar una fila la abre para editar. En móvil se ocultan las columnas secundarias.
 */
export function TablaMaestro<T>({
  filas,
  clave,
  columnas,
  buscarEn,
  placeholder,
  onAbrir,
  onEliminar,
  cargando,
  vacio,
  iconoVacio,
}: {
  filas: T[];
  clave: (f: T) => string;
  columnas: Columna<T>[];
  buscarEn: (f: T) => Array<string | null | undefined>;
  placeholder: string;
  onAbrir?: (f: T) => void;
  /** Recibe las claves seleccionadas; si falta, no hay selección ni borrado. */
  onEliminar?: (claves: string[]) => void;
  cargando?: boolean;
  vacio: { titulo: string; texto?: string; accion?: React.ReactNode };
  iconoVacio?: LucideIcon;
}) {
  const [texto, setTexto] = useState('');
  const q = useDeferredValue(texto);
  const [limite, setLimite] = useState(POR_PAGINA);
  const sel = useSeleccion();
  // Índice de búsqueda normalizado una sola vez por lista (no en cada tecla).
  const buscarRef = useRef(buscarEn);
  buscarRef.current = buscarEn;
  const indice = useMemo(() => filas.map((f) => normalizarBusqueda(buscarRef.current(f).filter(Boolean).join(' '))), [filas]);
  const filtradas = useMemo(() => {
    const palabras = normalizarBusqueda(q).split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return filas;
    return filas.filter((_, i) => palabras.every((p) => indice[i].includes(p)));
  }, [filas, indice, q]);
  const visibles = filtradas.slice(0, limite);
  const clavesFiltradas = useMemo(() => filtradas.map(clave), [filtradas, clave]);
  const marcadasFiltradas = clavesFiltradas.filter((k) => sel.tiene(k)).length;
  const conSeleccion = !!onEliminar;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input value={texto} onChange={(e) => { setTexto(e.target.value); setLimite(POR_PAGINA); }} placeholder={placeholder} aria-label={placeholder} className={`${estiloInput} pl-9`} />
        </div>
        <span className="text-sm text-slate-500">{filtradas.length.toLocaleString('es-VE')} de {filas.length.toLocaleString('es-VE')}</span>
      </div>

      {conSeleccion && (
        <BarraSeleccion cantidad={sel.cantidad} onLimpiar={sel.limpiar}>
          {marcadasFiltradas < clavesFiltradas.length && (
            <Boton tamano="sm" onClick={() => sel.fijarTodos(clavesFiltradas, true)}>Seleccionar los {clavesFiltradas.length.toLocaleString()} filtrados</Boton>
          )}
          <Boton tamano="sm" variante="peligro" icono={Trash2} onClick={() => { onEliminar?.([...sel.ids]); sel.limpiar(); }}>
            Eliminar {sel.cantidad}
          </Boton>
        </BarraSeleccion>
      )}

      <Tarjeta className="!p-0 overflow-hidden">
        {cargando ? (
          <p className="p-6 text-center text-sm text-slate-500">Cargando…</p>
        ) : filtradas.length === 0 ? (
          <Vacio icono={iconoVacio} titulo={filas.length === 0 ? vacio.titulo : 'Sin resultados'} texto={filas.length === 0 ? vacio.texto : 'Prueba con otra búsqueda.'} accion={filas.length === 0 ? vacio.accion : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  {conSeleccion && (
                    <th className="w-10 px-1">
                      <Casilla
                        etiqueta="Seleccionar todo lo visible"
                        marcada={visibles.length > 0 && visibles.every((f) => sel.tiene(clave(f)))}
                        parcial={visibles.some((f) => sel.tiene(clave(f))) && !visibles.every((f) => sel.tiene(clave(f)))}
                        onChange={(v) => sel.fijarTodos(visibles.map(clave), v)}
                      />
                    </th>
                  )}
                  {columnas.map((c) => (
                    <th key={c.titulo} className={`whitespace-nowrap px-3 py-2.5 ${c.secundaria ? 'hidden md:table-cell' : ''} ${c.alinear === 'derecha' ? 'text-right' : ''}`}>{c.titulo}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibles.map((f) => {
                  const k = clave(f);
                  const marcada = sel.tiene(k);
                  return (
                    <tr key={k} onClick={onAbrir ? () => onAbrir(f) : undefined} className={`${onAbrir ? 'cursor-pointer' : ''} ${marcada ? 'bg-marca-50 dark:bg-marca-950/60' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
                      {conSeleccion && (
                        <td className="w-10 px-1"><Casilla etiqueta={`Seleccionar ${k}`} marcada={marcada} onChange={() => sel.alternar(k)} /></td>
                      )}
                      {columnas.map((c) => (
                        <td key={c.titulo} className={`px-3 py-2 ${c.secundaria ? 'hidden md:table-cell' : ''} ${c.alinear === 'derecha' ? 'text-right tabular-nums' : ''}`}>{c.celda(f)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {filtradas.length > limite && (
          <div className="border-t border-slate-100 p-2 text-center dark:border-slate-800">
            <Boton variante="fantasma" onClick={() => setLimite((l) => l + POR_PAGINA)}>Ver {Math.min(POR_PAGINA, filtradas.length - limite)} más</Boton>
          </div>
        )}
      </Tarjeta>
    </div>
  );
}
