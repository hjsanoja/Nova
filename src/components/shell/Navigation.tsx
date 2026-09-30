import React, { useEffect, useMemo, useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import type { TabDef } from './navConfig';

interface NavProps {
  tabs: TabDef[];
  tabActiva: string;
  onCambiarTab: (id: string) => void;
}

/** Agrupa preservando el orden de aparición. */
function agrupar(tabs: TabDef[]): { grupo: string; items: TabDef[] }[] {
  const mapa = new Map<string, TabDef[]>();
  tabs.forEach((t) => mapa.set(t.grupo, [...(mapa.get(t.grupo) ?? []), t]));
  return Array.from(mapa, ([grupo, items]) => ({ grupo, items }));
}

/**
 * Navegación lateral. Tablet y laptop pequeña (md-xl): riel compacto de iconos con etiqueta corta.
 * PC (xl+): barra lateral con etiquetas completas y grupos.
 */
export const SideNav: React.FC<NavProps> = ({ tabs, tabActiva, onCambiarTab }) => {
  const grupos = useMemo(() => agrupar(tabs), [tabs]);
  const conGrupos = tabs.length > 6;

  return (
    <nav
      aria-label="Módulos de NOVA"
      className="hidden md:flex shrink-0 flex-col w-20 xl:w-64 sticky top-12 self-start h-[calc(100dvh-3rem)] overflow-y-auto scrollbar-none border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-3 px-1.5 xl:px-3"
    >
      {grupos.map(({ grupo, items }) => (
        <div key={grupo} className="mb-2 xl:mb-3">
          {conGrupos && (
            <p className="hidden xl:block px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {grupo}
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {items.map((item) => {
              const Icon = item.icon;
              const activo = tabActiva === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onCambiarTab(item.id)}
                    aria-current={activo ? 'page' : undefined}
                    title={item.label}
                    className={`w-full min-h-11 flex flex-col xl:flex-row items-center xl:gap-3 justify-center xl:justify-start gap-0.5 rounded-xl px-1 py-1.5 xl:px-3 xl:py-2 text-[10px] xl:text-sm font-semibold transition-colors ${
                      activo
                        ? 'bg-teal-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span className="xl:hidden leading-tight">{item.corto}</span>
                    <span className="hidden xl:block truncate">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
};

/** Barra inferior para móvil (< md): módulos principales + hoja "Más". */
export const BottomNav: React.FC<NavProps> = ({ tabs, tabActiva, onCambiarTab }) => {
  const [masAbierto, setMasAbierto] = useState(false);
  const principales = tabs.filter((t) => t.principal).slice(0, tabs.length > 5 ? 4 : 5);
  const secundarios = tabs.filter((t) => !principales.includes(t));
  const activoEnMas = secundarios.some((t) => t.id === tabActiva);

  useEffect(() => {
    if (!masAbierto) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMasAbierto(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [masAbierto]);

  const botonBase = 'min-h-14 flex flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold transition-colors active:scale-95';

  return (
    <>
      {masAbierto && (
        <div className="md:hidden fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-slate-950/50"
            onClick={() => setMasAbierto(false)}
          />
          <div role="dialog" aria-modal="true" aria-label="Más módulos" className="animate-in absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 pb-safe shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Más módulos</span>
              <button
                type="button"
                onClick={() => setMasAbierto(false)}
                aria-label="Cerrar"
                className="p-2 -m-2 rounded-lg text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {secundarios.map((item) => {
                const Icon = item.icon;
                const activo = tabActiva === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onCambiarTab(item.id);
                      setMasAbierto(false);
                    }}
                    aria-current={activo ? 'page' : undefined}
                    className={`min-h-20 flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-2 text-center text-xs font-semibold ${
                      activo
                        ? 'bg-teal-600 border-teal-600 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav
        aria-label="Módulos de NOVA"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pb-safe pl-safe pr-safe"
      >
        <div
          className="grid px-1 py-1"
          style={{ gridTemplateColumns: `repeat(${principales.length + (secundarios.length ? 1 : 0)}, minmax(0, 1fr))` }}
        >
          {principales.map((item) => {
            const Icon = item.icon;
            const activo = tabActiva === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onCambiarTab(item.id)}
                aria-current={activo ? 'page' : undefined}
                className={`${botonBase} ${activo ? 'text-teal-700 dark:text-teal-300' : 'text-slate-500 dark:text-slate-400'}`}
              >
                <span className={`px-4 py-1 rounded-full ${activo ? 'bg-teal-100 dark:bg-teal-950' : ''}`}>
                  <Icon className="w-5 h-5" />
                </span>
                <span className="leading-tight truncate max-w-full px-0.5">{item.corto}</span>
              </button>
            );
          })}
          {secundarios.length > 0 && (
            <button
              type="button"
              onClick={() => setMasAbierto(true)}
              aria-haspopup="dialog"
              className={`${botonBase} ${activoEnMas ? 'text-teal-700 dark:text-teal-300' : 'text-slate-500 dark:text-slate-400'}`}
            >
              <span className={`px-4 py-1 rounded-full ${activoEnMas ? 'bg-teal-100 dark:bg-teal-950' : ''}`}>
                <MoreHorizontal className="w-5 h-5" />
              </span>
              <span className="leading-tight">Más</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
};
