import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, Moon, Settings, Sun } from 'lucide-react';
import { RolUsuario, EquipoVentas, Usuario } from '../types/pharmacy';
import { useTheme } from '../context/ThemeContext';
import { NovaLogo } from './NovaLogo';
import { SyncStatusChip } from './SyncStatusChip';
import { FirmaVersion } from './version/Version';

interface HeaderProps {
  rolActual: RolUsuario;
  equipoActual: EquipoVentas;
  usuarioActual: Usuario | null;
  esDemo: boolean;
  onAbrirConfig: () => void;
  onCerrarSesion: () => void;
}

const ETIQUETA_ROL: Record<RolUsuario, string> = { admin: 'Administrador', gerente: 'Gerente', vendedor: 'Vendedor', teletransferencista: 'Transferencista' };

const itemMenu = 'w-full min-h-10 text-left px-3 py-2 rounded-xl text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5';

/** Barra superior mínima: marca, estado de sincronización, tema y menú de la cuenta. Todo lo demás vive en Configuración. */
export const Header: React.FC<HeaderProps> = ({ rolActual, equipoActual, usuarioActual, esDemo, onAbrirConfig, onCerrarSesion }) => {
  const { toggleTema, esClaro } = useTheme();
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setAbierto(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', esc);
    };
  }, [abierto]);

  const nombre = usuarioActual?.nombre_completo || 'Usuario';
  const rol = rolActual === 'vendedor' && equipoActual !== 'TODOS' ? `${ETIQUETA_ROL[rolActual]} · ${equipoActual}` : ETIQUETA_ROL[rolActual];
  const accion = (fn: () => void) => () => {
    setAbierto(false);
    fn();
  };

  return (
    <header className="sticky top-0 z-40 h-12 border-b border-slate-200 bg-white pl-safe pr-safe dark:border-slate-800 dark:bg-slate-900">
      <div className="flex h-full min-w-0 items-center justify-between gap-2 px-3 sm:px-5">
        <NovaLogo size="sm" esClaro={esClaro} />
        <div className="flex shrink-0 items-center gap-1">
          {esDemo && <span className="hidden rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900 sm:inline dark:bg-amber-950 dark:text-amber-300">Demostración</span>}
          <SyncStatusChip onAbrirConfig={onAbrirConfig} />
          <button
            type="button"
            onClick={toggleTema}
            aria-label={esClaro ? 'Activar modo oscuro' : 'Activar modo claro'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-amber-300 dark:hover:bg-slate-800"
          >
            {esClaro ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
          <div className="relative" ref={ref}>
            <button
              type="button"
              onClick={() => setAbierto((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={abierto}
              className="flex h-9 items-center gap-2 rounded-xl pl-1 pr-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-marca-700 text-xs font-bold text-white">{nombre.charAt(0).toUpperCase()}</span>
              <span className="hidden max-w-36 flex-col text-left leading-tight md:flex">
                <span className="truncate text-xs font-bold">{nombre}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{rol}</span>
              </span>
              <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 sm:block" />
            </button>
            {abierto && (
              <div role="menu" className="animate-in absolute right-0 z-50 mt-2 w-64 max-w-[calc(100vw-1.5rem)] rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-100 px-3 pb-2 pt-1 dark:border-slate-800">
                  <p className="truncate text-sm font-bold">{nombre}</p>
                  <p className="truncate text-xs text-slate-500">{usuarioActual?.email}</p>
                  <p className="text-xs font-semibold text-marca-700 dark:text-marca-300">{rol}</p>
                </div>
                <div className="pt-1">
                  <button type="button" role="menuitem" onClick={accion(onAbrirConfig)} className={itemMenu}>
                    <Settings className="h-4 w-4 text-marca-600" /> Configuración
                  </button>
                  <button type="button" role="menuitem" onClick={accion(onCerrarSesion)} className={`${itemMenu} text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40`}>
                    <LogOut className="h-4 w-4" /> Cerrar sesión
                  </button>
                </div>
                <div className="mt-1 border-t border-slate-100 pt-1 dark:border-slate-800">
                  <FirmaVersion variante="completa" className="w-full px-3 py-2" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
