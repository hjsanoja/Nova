import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Database, Info, LogOut, Lock, Moon, Sun } from 'lucide-react';
import { RolUsuario, EquipoVentas, Usuario } from '../types/pharmacy';
import { useTheme } from '../context/ThemeContext';
import { NovaLogo } from './NovaLogo';

interface HeaderProps {
  rolActual: RolUsuario;
  equipoActual: EquipoVentas;
  isSupabaseConectado: boolean;
  onAbrirConfigSupabase: () => void;
  usuarioActual: Usuario | null;
  onAbrirAuthModal: () => void;
  onAbrirCreditos: () => void;
  onCerrarSesion: () => void;
}

const BADGE_ROL: Record<RolUsuario, { texto: string; clases: string }> = {
  admin: { texto: 'Admin', clases: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-300 dark:border-purple-800' },
  gerente: { texto: 'Gerente', clases: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300 dark:border-blue-800' },
  vendedor: { texto: 'Vendedor', clases: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800' },
  teletransferencista: { texto: 'Teletransferencista', clases: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 border-teal-300 dark:border-teal-800' },
};

const itemMenu = 'w-full min-h-11 text-left px-3 py-2 rounded-xl text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5';

/** Barra superior compacta: una sola fila en todos los tamaños. La navegación vive en Navigation.tsx. */
export const Header: React.FC<HeaderProps> = ({
  rolActual,
  equipoActual,
  isSupabaseConectado,
  onAbrirConfigSupabase,
  usuarioActual,
  onAbrirAuthModal,
  onAbrirCreditos,
  onCerrarSesion,
}) => {
  const { toggleTema, esClaro } = useTheme();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuAbierto) return;
    const alPulsar = (e: PointerEvent) => {
      if (!contenedorRef.current?.contains(e.target as Node)) setMenuAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && setMenuAbierto(false);
    document.addEventListener('pointerdown', alPulsar);
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('pointerdown', alPulsar);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [menuAbierto]);

  const badge = BADGE_ROL[rolActual];
  const etiquetaRol = rolActual === 'vendedor' ? `${badge.texto} · ${equipoActual}` : badge.texto;
  const inicial = usuarioActual?.nombre_completo.charAt(0).toUpperCase() || 'U';
  const accion = (fn: () => void) => () => {
    setMenuAbierto(false);
    fn();
  };

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-safe pr-safe">
      <div className="h-full px-3 sm:px-5 flex items-center justify-between gap-2">
        <NovaLogo size="md" esClaro={esClaro} />

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onAbrirConfigSupabase}
            className={`hidden sm:inline-flex min-h-10 items-center gap-1.5 px-3 rounded-xl text-xs font-semibold border ${
              isSupabaseConectado
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700'
            }`}
            title="Estado de conexión con Supabase PostgreSQL"
          >
            <Database className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{isSupabaseConectado ? 'Supabase conectado' : 'Supabase (configurar)'}</span>
            <span className="lg:hidden">{isSupabaseConectado ? 'Conectado' : 'Local'}</span>
          </button>

          <button
            type="button"
            onClick={toggleTema}
            className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-amber-300"
            aria-label={esClaro ? 'Activar modo oscuro' : 'Activar modo claro'}
          >
            {esClaro ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>

          <div className="relative" ref={contenedorRef}>
            <button
              type="button"
              onClick={() => setMenuAbierto((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuAbierto}
              className="min-h-10 flex items-center gap-2 pl-1.5 pr-2 sm:pr-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              <span className="w-7 h-7 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center text-xs">
                {inicial}
              </span>
              <span className="hidden md:flex flex-col text-left leading-tight">
                <span className="font-bold text-xs truncate max-w-32">{usuarioActual?.nombre_completo || 'Usuario'}</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">{etiquetaRol}</span>
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
            </button>

            {menuAbierto && (
              <div
                role="menu"
                className="animate-in absolute right-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-xl p-2 z-50 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
              >
                <div className="p-3 border-b border-slate-100 dark:border-slate-800">
                  <p className="font-bold text-sm truncate">{usuarioActual?.nombre_completo || 'Sin sesión'}</p>
                  <p className="text-xs text-slate-500 truncate">{usuarioActual?.email}</p>
                  <span className={`mt-2 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.clases}`}>
                    {etiquetaRol}
                  </span>
                </div>
                <div className="py-1">
                  <button type="button" role="menuitem" onClick={accion(onAbrirConfigSupabase)} className={`${itemMenu} sm:hidden`}>
                    <Database className="w-4 h-4 text-teal-600" />
                    <span>{isSupabaseConectado ? 'Supabase conectado' : 'Configurar Supabase'}</span>
                  </button>
                  <button type="button" role="menuitem" onClick={accion(onAbrirAuthModal)} className={itemMenu}>
                    <Lock className="w-4 h-4 text-teal-600" />
                    <span>Cambiar de cuenta</span>
                  </button>
                  <button type="button" role="menuitem" onClick={accion(onAbrirCreditos)} className={itemMenu}>
                    <Info className="w-4 h-4 text-indigo-500" />
                    <span>Acerca de NOVA · v2.1</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={accion(onCerrarSesion)}
                    className={`${itemMenu} text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40`}
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Cerrar sesión</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
