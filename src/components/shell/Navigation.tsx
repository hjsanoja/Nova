import React, { useEffect, useMemo, useState } from 'react';
import { MoreHorizontal, PlusCircle, X } from 'lucide-react';
import { NovaLogo } from '../NovaLogo';
import { Avatar } from '../ui/kit';
import type { TabDef } from './navConfig';
import { FirmaVersion } from '../version/Version';

interface NavProps {
  tabs: TabDef[];
  tabActiva: string;
  onCambiarTab: (id: string) => void;
}

interface SideNavProps extends NavProps {
  /** Nombre y rol de quien usa la app (tarjeta al pie del menú). */
  nombre: string;
  rol: string;
}

/** Agrupa preservando el orden de aparición. */
function agrupar(tabs: TabDef[]): { grupo: string; items: TabDef[] }[] {
  const mapa = new Map<string, TabDef[]>();
  tabs.forEach((t) => mapa.set(t.grupo, [...(mapa.get(t.grupo) ?? []), t]));
  return Array.from(mapa, ([grupo, items]) => ({ grupo, items }));
}

/**
 * Menú lateral a toda la altura. Tablet y laptop pequeña (md–xl): riel compacto de iconos con etiqueta corta.
 * PC (xl+): logo, botón principal ("Tomar pedido" si el rol pide), grupos con rótulo, y al pie la persona y la versión.
 */
export const SideNav: React.FC<SideNavProps> = ({ tabs, tabActiva, onCambiarTab, nombre, rol }) => {
  const grupos = useMemo(() => agrupar(tabs.filter((t) => t.id !== 'config')), [tabs]);
  const config = tabs.find((t) => t.id === 'config');
  const puedePedir = tabs.some((t) => t.id === 'captura');
  const conGrupos = tabs.length > 5;

  const item = (t: TabDef) => {
    const Icon = t.icon;
    const activo = tabActiva === t.id;
    return (
      <li key={t.id}>
        <button
          type="button"
          onClick={() => onCambiarTab(t.id)}
          aria-current={activo ? 'page' : undefined}
          title={t.label}
          className={`flex min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-xs font-semibold transition-all xl:flex-row xl:justify-start xl:gap-3 xl:px-3 xl:py-2 xl:text-sm ${
            activo
              ? 'bg-marca-700 text-white shadow-tarjeta dark:bg-marca-600'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
          }`}
        >
          <Icon className="h-5 w-5 shrink-0" />
          <span className="leading-tight xl:hidden">{t.corto}</span>
          <span className="hidden truncate xl:block">{t.label}</span>
        </button>
      </li>
    );
  };

  return (
    <nav
      aria-label="Módulos de NOVA"
      className="sticky top-0 hidden h-dvh w-20 shrink-0 flex-col self-start overflow-y-auto border-r border-slate-200/70 bg-white px-1.5 pb-3 shadow-[0_1px_8px_rgba(0,0,0,0.04)] scrollbar-none md:flex xl:w-64 xl:px-3 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex h-16 shrink-0 items-center justify-center xl:justify-start xl:px-2">
        <NovaLogo size="sm" showTagline={false} className="xl:hidden" />
        <NovaLogo size="sm" className="hidden xl:flex" />
      </div>
      {puedePedir && (
        <button
          type="button"
          onClick={() => onCambiarTab('captura')}
          aria-label="Tomar pedido"
          title="Tomar pedido"
          className="mb-3 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-marca-700 px-3 text-sm font-semibold text-white shadow-tarjeta transition-all hover:bg-marca-800 hover:shadow-elevada active:scale-[0.98] dark:bg-marca-600"
        >
          <PlusCircle className="h-5 w-5 shrink-0" aria-hidden />
          <span className="hidden xl:inline">Tomar pedido</span>
        </button>
      )}
      {grupos.map(({ grupo, items }) => (
        <div key={grupo} className="mb-2 xl:mb-3">
          {conGrupos && <p className="hidden px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 xl:block">{grupo}</p>}
          <ul className="flex flex-col gap-1">{items.map(item)}</ul>
        </div>
      ))}
      <div className="mt-auto flex flex-col gap-1 pt-2">
        {config && <ul>{item(config)}</ul>}
        <div className="hidden items-center gap-2.5 rounded-xl bg-slate-50 p-2.5 xl:flex dark:bg-slate-800/60">
          <Avatar nombre={nombre} tamano={34} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{nombre}</p>
            <p className="truncate text-xs text-slate-500">{rol}</p>
          </div>
        </div>
        <FirmaVersion variante="minima" className="flex w-full justify-center px-1 py-2 xl:hidden" />
        <FirmaVersion variante="completa" className="hidden w-full px-2.5 py-2 xl:block" />
      </div>
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

  const botonBase = 'min-h-14 flex flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-semibold transition-colors active:scale-95';

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
          <div role="dialog" aria-modal="true" aria-label="Más módulos" className="animate-in absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-2xl bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 pb-safe shadow-xl">
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
                    className={`min-h-20 flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-2 text-center text-xs font-semibold transition-all active:scale-95 ${
                      activo
                        ? 'bg-marca-700 border-marca-700 text-white shadow-tarjeta'
                        : 'bg-white border-slate-200 text-slate-700 shadow-tarjeta dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
              <FirmaVersion variante="completa" className="w-full px-2 py-1.5" />
            </div>
          </div>
        </div>
      )}

      <nav
        aria-label="Módulos de NOVA"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-200/60 bg-white/90 shadow-[0_-2px_12px_rgba(0,0,0,0.04)] backdrop-blur-xl pb-safe pl-safe pr-safe dark:border-slate-800 dark:bg-slate-900/90"
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
                className={`${botonBase} ${activo ? 'text-marca-800 dark:text-marca-300' : 'text-slate-500 dark:text-slate-400'}`}
              >
                <span className={`px-4 py-1 rounded-full transition-colors ${activo ? 'bg-marca-100 dark:bg-marca-950' : ''}`}>
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
              className={`${botonBase} ${activoEnMas ? 'text-marca-700 dark:text-marca-300' : 'text-slate-500 dark:text-slate-400'}`}
            >
              <span className={`px-4 py-1 rounded-full ${activoEnMas ? 'bg-marca-100 dark:bg-marca-950' : ''}`}>
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
