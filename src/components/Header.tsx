import React, { useState } from 'react';
import { 
  Pill, 
  ShieldCheck, 
  Database, 
  Layers, 
  CheckCircle2, 
  User, 
  RefreshCw, 
  ShoppingCart, 
  ShoppingBag, 
  UploadCloud, 
  Lock,
  Sun,
  Moon,
  BookOpen,
  LayoutDashboard,
  Menu,
  X,
  MoreHorizontal,
  Users,
  Info,
  LogOut,
  ChevronDown
} from 'lucide-react';
import { RolUsuario, EquipoVentas, Usuario } from '../types/pharmacy';
import { useTheme } from '../context/ThemeContext';
import { NovaLogo } from './NovaLogo';

interface HeaderProps {
  rolActual: RolUsuario;
  equipoActual: EquipoVentas;
  isSupabaseConectado: boolean;
  onAbrirConfigSupabase: () => void;
  tabActiva: string;
  onCambiarTab: (tab: string) => void;
  usuarioActual: Usuario | null;
  onAbrirAuthModal: () => void;
  onAbrirCreditos?: () => void;
  onCerrarSesion?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  rolActual,
  equipoActual,
  isSupabaseConectado,
  onAbrirConfigSupabase,
  tabActiva,
  onCambiarTab,
  usuarioActual,
  onAbrirAuthModal,
  onAbrirCreditos,
  onCerrarSesion,
}) => {
  const { toggleTema, esClaro } = useTheme();
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const [menuPerfilAbierto, setMenuPerfilAbierto] = useState(false);

  // Configuración de pestañas permitidas estrictamente según el perfil del usuario autenticado
  const tabsPorRol: Record<RolUsuario, { id: string; label: string; icon: any }[]> = {
    vendedor: [
      { id: 'dashboard', label: 'Mi Rendimiento', icon: LayoutDashboard },
      { id: 'nuevo_pedido', label: 'Toma de Pedido', icon: ShoppingCart },
      { id: 'sugerido', label: 'Motor Sugerido', icon: RefreshCw },
      { id: 'mis_pedidos', label: 'Mis Pedidos', icon: ShoppingBag },
      { id: 'vademecum', label: 'Medicamentos', icon: Pill },
      { id: 'guia_uso', label: 'Guía de Uso', icon: BookOpen },
    ],
    teletransferencista: [
      { id: 'teletransferencia', label: 'Teletransferencias & Facturación', icon: CheckCircle2 },
      { id: 'droguerias_csv', label: 'Layouts CSV Droguerías', icon: Layers },
      { id: 'vademecum', label: 'Medicamentos', icon: Pill },
      { id: 'guia_uso', label: 'Guía de Uso', icon: BookOpen },
    ],
    gerente: [
      { id: 'dashboard', label: 'Monitoreo Ejecutivo', icon: LayoutDashboard },
      { id: 'mis_pedidos', label: 'Auditoría Pedidos', icon: ShoppingBag },
      { id: 'sugerido', label: 'Motor Sugeridos', icon: RefreshCw },
      { id: 'carga_datos', label: 'Visor de Datos', icon: Database },
      { id: 'vademecum', label: 'Medicamentos', icon: Pill },
      { id: 'guia_uso', label: 'Guía de Uso', icon: BookOpen },
    ],
    admin: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'usuarios', label: 'Gestión Usuarios', icon: Users },
      { id: 'carga_datos', label: 'Carga de Datos', icon: Database },
      { id: 'nuevo_pedido', label: 'Toma de Pedidos', icon: ShoppingCart },
      { id: 'sugerido', label: 'Sugeridos', icon: RefreshCw },
      { id: 'teletransferencia', label: 'Teletransferencias', icon: CheckCircle2 },
      { id: 'carga_inventario', label: 'Carga Masiva', icon: UploadCloud },
      { id: 'droguerias_csv', label: 'Layouts CSV', icon: Layers },
      { id: 'vademecum', label: 'Vademécum', icon: Pill },
      { id: 'mis_pedidos', label: 'Auditoría', icon: ShoppingBag },
      { id: 'sql_script', label: 'Script SQL', icon: Database },
      { id: 'guia_uso', label: 'Guía de Uso', icon: BookOpen },
    ],
  };

  const tabsVisibles = tabsPorRol[rolActual] || tabsPorRol.admin;

  const renderBadgeRol = () => {
    switch (rolActual) {
      case 'admin':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-300">
            Admin Total
          </span>
        );
      case 'gerente':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300">
            Gerente Monitoreo
          </span>
        );
      case 'vendedor':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-300">
            Vendedor · {equipoActual}
          </span>
        );
      case 'teletransferencista':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 border border-teal-300">
            Teletransferencista
          </span>
        );
    }
  };

  return (
    <>
      {/* Barra Superior */}
      <header className={`border-b sticky top-0 z-40 backdrop-blur transition-colors ${
        esClaro 
          ? 'bg-white/95 border-slate-200 shadow-xs' 
          : 'bg-slate-900/95 border-slate-800'
      }`}>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-2">
            
            {/* Logotipo Oficial Nova */}
            <div className="flex items-center gap-3">
              <NovaLogo size="md" esClaro={esClaro} />
              
              {/* Botón de Créditos y Versión Público pero Discreto */}
              <button
                type="button"
                onClick={onAbrirCreditos}
                className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Ver créditos de desarrollo y arquitectura"
              >
                <Info className="w-3.5 h-3.5 text-teal-600" />
                <span>v2.0</span>
              </button>
            </div>

            {/* Controles Desktop: Usuario Autenticado, Supabase, Tema y Perfil */}
            <div className="hidden lg:flex items-center gap-2.5">
              
              {/* Conexión Supabase */}
              <button
                onClick={onAbrirConfigSupabase}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  isSupabaseConectado
                    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300'
                    : esClaro
                    ? 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
                title="Estado de conexión con Supabase PostgreSQL"
              >
                <Database className="w-3.5 h-3.5 text-teal-600" />
                <span className="text-[11px] font-medium">
                  {isSupabaseConectado ? 'Supabase Conectado' : 'Supabase (Configurar)'}
                </span>
              </button>

              {/* Tema Claro / Oscuro */}
              <button
                onClick={toggleTema}
                className={`p-2 rounded-xl text-xs font-semibold border transition-all ${
                  esClaro
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700'
                }`}
                title={esClaro ? 'Modo Oscuro' : 'Modo Claro'}
              >
                {esClaro ? <Moon className="w-4 h-4 text-slate-600" /> : <Sun className="w-4 h-4 text-amber-400" />}
              </button>

              {/* Tarjeta de Sesión del Usuario Autenticado (El rol no se cambia con botón, proviene de la sesión) */}
              <div className="relative">
                <button
                  onClick={() => setMenuPerfilAbierto(!menuPerfilAbierto)}
                  className={`flex items-center gap-2 pl-3 pr-2.5 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                    esClaro
                      ? 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200 shadow-xs'
                      : 'bg-slate-800 hover:bg-slate-750 text-slate-100 border-slate-700'
                  }`}
                >
                  <div className="w-6 h-6 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center text-[11px]">
                    {usuarioActual ? usuarioActual.nombre_completo.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="font-bold text-xs truncate max-w-36">
                      {usuarioActual?.nombre_completo || 'Usuario'}
                    </span>
                    <span className="text-[10px] text-slate-400 leading-tight">
                      {usuarioActual?.email || 'Sin sesión'}
                    </span>
                  </div>
                  {renderBadgeRol()}
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
                </button>

                {/* Dropdown de Usuario */}
                {menuPerfilAbierto && (
                  <div className={`absolute right-0 mt-2 w-64 rounded-2xl border shadow-xl p-2 z-50 animate-in fade-in ${
                    esClaro ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
                  }`}>
                    <div className="p-3 border-b border-slate-100 dark:border-slate-800">
                      <p className="font-bold text-sm">{usuarioActual?.nombre_completo}</p>
                      <p className="text-xs text-slate-400 truncate">{usuarioActual?.email}</p>
                      <div className="mt-2 flex items-center gap-1.5">
                        {renderBadgeRol()}
                        {usuarioActual?.rol === 'admin' && (
                          <span className="text-[10px] text-teal-600 font-semibold">Dev & Admin</span>
                        )}
                      </div>
                    </div>

                    <div className="py-1">
                      <button
                        onClick={() => {
                          setMenuPerfilAbierto(false);
                          onAbrirAuthModal();
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                      >
                        <Lock className="w-3.5 h-3.5 text-teal-600" />
                        <span>Cambiar de Cuenta / Supabase Auth</span>
                      </button>

                      <button
                        onClick={() => {
                          setMenuPerfilAbierto(false);
                          onAbrirCreditos?.();
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                      >
                        <Info className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Acerca de Nova & Créditos</span>
                      </button>

                      {onCerrarSesion && (
                        <button
                          onClick={() => {
                            setMenuPerfilAbierto(false);
                            onCerrarSesion();
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Cerrar Sesión</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Botón de Menú Móvil */}
            <div className="flex items-center gap-2 lg:hidden">
              <button
                onClick={() => setMenuMovilAbierto(!menuMovilAbierto)}
                className={`p-2 rounded-xl border ${
                  esClaro ? 'bg-slate-100 border-slate-200 text-slate-800' : 'bg-slate-800 border-slate-700 text-white'
                }`}
                aria-label="Abrir menú"
              >
                {menuMovilAbierto ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>

          </div>

          {/* Menú Móvil Plegable */}
          {menuMovilAbierto && (
            <div className={`lg:hidden border-t py-4 px-2 space-y-4 animate-in slide-in-from-top duration-200 ${
              esClaro ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900'
            }`}>
              
              {/* Tarjeta de Usuario en Móvil */}
              <div className={`p-3 rounded-xl border flex items-center justify-between ${
                esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-800 border-slate-700'
              }`}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center text-xs">
                    {usuarioActual ? usuarioActual.nombre_completo.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div>
                    <p className="font-bold text-xs">{usuarioActual?.nombre_completo}</p>
                    <p className="text-[10px] text-slate-400">{usuarioActual?.email}</p>
                  </div>
                </div>
                <div>{renderBadgeRol()}</div>
              </div>

              {/* Módulos de la Aplicación según Rol */}
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2 px-1">
                  Módulos de Nova:
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {tabsVisibles.map((item) => {
                    const Icon = item.icon;
                    const activo = tabActiva === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          onCambiarTab(item.id);
                          setMenuMovilAbierto(false);
                        }}
                        className={`min-h-[44px] px-3 py-2 rounded-xl font-semibold flex items-center gap-2 border transition-all text-left ${
                          activo
                            ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                            : esClaro
                            ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                        }`}
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${activo ? 'text-white' : 'text-teal-600 dark:text-teal-400'}`} />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Acciones Rápidas */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                <button
                  onClick={() => {
                    onAbrirAuthModal();
                    setMenuMovilAbierto(false);
                  }}
                  className={`min-h-[44px] p-2.5 rounded-xl border flex items-center justify-center gap-2 font-semibold ${
                    esClaro ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-slate-800 border-slate-700 text-white'
                  }`}
                >
                  <Lock className="w-4 h-4 text-teal-600" />
                  <span>Cuentas</span>
                </button>

                <button
                  onClick={() => {
                    onAbrirCreditos?.();
                    setMenuMovilAbierto(false);
                  }}
                  className={`min-h-[44px] p-2.5 rounded-xl border flex items-center justify-center gap-2 font-semibold ${
                    esClaro ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-slate-800 border-slate-700 text-white'
                  }`}
                >
                  <Info className="w-4 h-4 text-indigo-500" />
                  <span>Créditos Nova</span>
                </button>
              </div>

            </div>
          )}

          {/* Barra de pestañas horizontal en Desktop */}
          <nav className="hidden lg:flex space-x-1 sm:space-x-1.5 overflow-x-auto py-2 scrollbar-none border-t border-slate-200 dark:border-slate-800">
            {tabsVisibles.map((item) => {
              const Icon = item.icon;
              const activo = tabActiva === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onCambiarTab(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    activo
                      ? 'bg-teal-600 text-white shadow-xs'
                      : esClaro
                      ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${activo ? 'text-white' : 'text-slate-400'}`} />
                  {item.label}
                </button>
              );
            })}
          </nav>

        </div>
      </header>

      {/* BARRA DE NAVEGACIÓN INFERIOR NATIVA PARA MÓVILES (Bottom App Bar) */}
      <nav className={`lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-md transition-colors ${
        esClaro 
          ? 'bg-white/95 border-slate-200 shadow-xl' 
          : 'bg-slate-900/95 border-slate-800 shadow-2xl'
      }`}>
        <div className="grid grid-cols-5 h-16 max-w-md mx-auto items-center px-1">
          {(tabsVisibles.length <= 5 ? tabsVisibles : tabsVisibles.slice(0, 4)).map((item) => {
            const Icon = item.icon;
            const activo = tabActiva === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onCambiarTab(item.id)}
                className={`min-h-[48px] flex flex-col items-center justify-center py-1 rounded-xl transition-all relative active:scale-95 ${
                  activo
                    ? 'text-teal-600 dark:text-teal-400 font-bold'
                    : esClaro
                    ? 'text-slate-500 hover:text-slate-800'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className={`p-1 rounded-lg ${activo ? 'bg-teal-50 dark:bg-teal-950/60' : ''}`}>
                  <Icon className={`w-5 h-5 ${activo ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
                </div>
                <span className="text-[10px] leading-tight truncate max-w-16">
                  {item.label.split(' ')[0]}
                </span>
                {activo && (
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-600 dark:bg-teal-400 absolute bottom-1" />
                )}
              </button>
            );
          })}

          {/* Botón "Más" si hay más de 5 pestañas para el rol actual */}
          {tabsVisibles.length > 5 && (
            <button
              onClick={() => setMenuMovilAbierto(!menuMovilAbierto)}
              className={`min-h-[48px] flex flex-col items-center justify-center py-1 rounded-xl transition-all relative active:scale-95 ${
                menuMovilAbierto
                  ? 'text-teal-600 dark:text-teal-400 font-bold'
                  : esClaro
                  ? 'text-slate-500 hover:text-slate-800'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className={`p-1 rounded-lg ${menuMovilAbierto ? 'bg-teal-50 dark:bg-teal-950/60' : ''}`}>
                <MoreHorizontal className="w-5 h-5 stroke-[2]" />
              </div>
              <span className="text-[10px] leading-tight">Más</span>
              {menuMovilAbierto && (
                <span className="w-1.5 h-1.5 rounded-full bg-teal-600 dark:bg-teal-400 absolute bottom-1" />
              )}
            </button>
          )}
        </div>
      </nav>
    </>
  );
};
