import React, { useState, useMemo } from 'react';
import { Usuario, RolUsuario, EquipoVentas } from '../types/pharmacy';
import { crearClienteSinSesion, getSupabaseClient } from '../services/supabaseClient';
import { crearUsuarioNube } from '../services/nubeV3';
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  User, 
  Layers, 
  Search, 
  AlertCircle, 
  Key, 
  LogIn, 
  X,
  Phone,
  Mail,
  CheckCircle2,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface AdminUsersTabProps {
  usuarios: Usuario[];
  onCrearUsuario: (nuevo: Omit<Usuario, 'id' | 'created_at'> & { password?: string }) => void;
  onSimularUsuario: (usuario: Usuario) => void;
  usuarioActual: Usuario | null;
}

export const AdminUsersTab: React.FC<AdminUsersTabProps> = ({
  usuarios,
  onCrearUsuario,
  onSimularUsuario,
  usuarioActual,
}) => {
  const { esClaro } = useTheme();
  const [busqueda, setBusqueda] = useState('');
  const [filtroRol, setFiltroRol] = useState<string>('todos');
  const [filtroEquipo, setFiltroEquipo] = useState<string>('todos');

  // Modal Crear Usuario
  const [modalCrearAbierto, setModalCrearAbierto] = useState(false);
  const [modalResetAbierto, setModalResetAbierto] = useState<Usuario | null>(null);
  const [nuevaPassword, setNuevaPassword] = useState('');

  const [formNuevo, setFormNuevo] = useState({
    nombre_completo: '',
    email: '',
    password: '',
    rol: 'vendedor' as RolUsuario,
    equipo: 'La Sante' as EquipoVentas,
    telefono: '',
    activo: true,
  });

  const [notificacion, setNotificacion] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  const showNotification = (tipo: 'exito' | 'error', texto: string) => {
    setNotificacion({ tipo, texto });
    setTimeout(() => setNotificacion(null), 4000);
  };

  const metricas = useMemo(() => {
    const total = usuarios.length;
    const admins = usuarios.filter((u) => u.rol === 'admin').length;
    const gerentes = usuarios.filter((u) => u.rol === 'gerente').length;
    const vendedores = usuarios.filter((u) => u.rol === 'vendedor').length;
    const transferencistas = usuarios.filter((u) => u.rol === 'teletransferencista').length;
    const laSante = usuarios.filter((u) => u.equipo === 'La Sante' && u.rol === 'vendedor').length;
    const comercial = usuarios.filter((u) => u.equipo === 'Comercial' && u.rol === 'vendedor').length;
    const otc = usuarios.filter((u) => u.equipo === 'OTC' && u.rol === 'vendedor').length;

    return { total, admins, gerentes, vendedores, transferencistas, laSante, comercial, otc };
  }, [usuarios]);

  const usuariosFiltrados = useMemo(() => {
    return usuarios.filter((u) => {
      if (filtroRol !== 'todos' && u.rol !== filtroRol) return false;
      if (filtroEquipo !== 'todos' && u.equipo !== filtroEquipo) return false;
      if (!busqueda.trim()) return true;
      const q = busqueda.toLowerCase();
      return (
        u.nombre_completo.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.telefono && u.telefono.toLowerCase().includes(q))
      );
    });
  }, [usuarios, busqueda, filtroRol, filtroEquipo]);

  const handleCrearSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNuevo.nombre_completo || !formNuevo.email) {
      showNotification('error', 'Por favor complete el nombre y correo del usuario.');
      return;
    }

    if (formNuevo.password.length < 6) {
      showNotification('error', 'La clave debe tener al menos 6 caracteres.');
      return;
    }

    const supabase = getSupabaseClient();
    const registro = crearClienteSinSesion();
    if (supabase && registro) {
      // La cuenta se crea con un cliente aparte (no reemplaza la sesión del administrador) y el rol/equipo los asigna
      // el administrador en la base mediante una función protegida: nunca viajan en los metadatos del registro.
      try {
        await crearUsuarioNube(supabase, registro, {
          email: formNuevo.email.trim(),
          password: formNuevo.password.trim(),
          nombre_completo: formNuevo.nombre_completo.trim(),
          rol: formNuevo.rol,
          equipo: formNuevo.equipo,
          telefono: formNuevo.telefono.trim() || undefined,
          activo: formNuevo.activo,
        });
      } catch (err: unknown) {
        showNotification('error', err instanceof Error ? err.message : String(err));
        return;
      }
    }

    onCrearUsuario({
      nombre_completo: formNuevo.nombre_completo.trim(),
      email: formNuevo.email.trim(),
      password: formNuevo.password.trim(),
      rol: formNuevo.rol,
      equipo: formNuevo.equipo,
      telefono: formNuevo.telefono.trim(),
      activo: formNuevo.activo,
    });

    showNotification('exito', `Usuario ${formNuevo.nombre_completo} creado correctamente.`);
    setModalCrearAbierto(false);
    setFormNuevo({
      nombre_completo: '',
      email: '',
      password: '',
      rol: 'vendedor',
      equipo: 'La Sante',
      telefono: '',
      activo: true,
    });
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalResetAbierto) return;
    if (nuevaPassword.length < 6) {
      showNotification('error', 'La nueva contraseña debe tener mínimo 6 caracteres.');
      return;
    }

    // El navegador no puede fijar la clave de otro usuario (requiere la service key): solo se envía el
    // correo de restablecimiento de Supabase. Antes se mostraba un "éxito" aunque no se hubiera hecho nada.
    const supabase = getSupabaseClient();
    if (!supabase) {
      showNotification('error', 'Conecta Supabase para restablecer contraseñas: en modo local no hay claves que cambiar.');
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(modalResetAbierto.email);
      if (error) {
        showNotification('error', `No se pudo enviar el correo: ${error.message}`);
        return;
      }
    } catch (err: unknown) {
      showNotification('error', `Fallo de red al enviar el correo: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    showNotification('exito', `Se envió a ${modalResetAbierto.email} un enlace para restablecer su contraseña.`);
    setModalResetAbierto(null);
    setNuevaPassword('');
  };

  return (
    <div className="space-y-5 w-full">

      {/* Toast Notificación */}
      {notificacion && (
        <div className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between shadow-md transition-all ${
          notificacion.tipo === 'exito'
            ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30'
            : 'bg-red-500/10 text-red-800 dark:text-red-300 border border-red-500/30'
        }`}>
          <div className="flex items-center gap-2">
            {notificacion.tipo === 'exito' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600" />
            )}
            <span>{notificacion.texto}</span>
          </div>
          <button onClick={() => setNotificacion(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Cabecera Principal del Módulo Admin */}
      <div className={`p-5 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
        esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800 shadow-lg'
      }`}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-teal-500/10 text-teal-600 flex items-center justify-center font-bold">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-teal-600">
              Control de Accesos & Seguridad
            </span>
          </div>
          <h2 className={`text-xl font-bold ${esClaro ? 'text-slate-900' : 'text-white'}`}>
            Gestión de Usuarios, Roles & Equipos
          </h2>
          <p className={`text-xs mt-0.5 ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
            Administra credenciales, perfiles jerárquicos (Admin, Gerente, Vendedores por Equipo La Santé/Comercial/OTC y Transferencistas).
          </p>
        </div>

        <button
          onClick={() => setModalCrearAbierto(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs bg-teal-600 hover:bg-teal-700 text-white transition-all shadow-sm shrink-0 min-h-[44px]"
        >
          <UserPlus className="w-4 h-4" />
          <span>Registrar Nuevo Usuario</span>
        </button>
      </div>

      {/* KPI Cards de Usuarios y Niveles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        
        <div className={`p-4 rounded-xl border ${
          esClaro ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-[#74777e] mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Usuarios</span>
            <Users className="w-4 h-4 text-teal-600" />
          </div>
          <div className="font-display text-2xl font-bold text-[#001428] dark:text-white">
            {metricas.total}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {metricas.admins} Administradores · {metricas.gerentes} Gerentes
          </div>
        </div>

        <div className={`p-4 rounded-xl border ${
          esClaro ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-[#74777e] mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Ventas La Santé</span>
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
          </div>
          <div className="font-display text-2xl font-bold text-[#001428] dark:text-white">
            {metricas.laSante}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Equipo Médico / Farmacéutico
          </div>
        </div>

        <div className={`p-4 rounded-xl border ${
          esClaro ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-[#74777e] mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Ventas Comercial</span>
            <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
          </div>
          <div className="font-display text-2xl font-bold text-[#001428] dark:text-white">
            {metricas.comercial}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Equipo Comercial Institucional
          </div>
        </div>

        <div className={`p-4 rounded-xl border ${
          esClaro ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-[#74777e] mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Equipo OTC & Transf.</span>
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          </div>
          <div className="font-display text-2xl font-bold text-[#001428] dark:text-white">
            {metricas.otc} <span className="text-xs font-normal text-slate-500">OTC</span> · {metricas.transferencistas} <span className="text-xs font-normal text-slate-500">EDI</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Mostrador & Teletransferencias
          </div>
        </div>

      </div>

      {/* Barra de Búsqueda y Filtros */}
      <div className={`p-4 rounded-2xl border space-y-3 ${
        esClaro ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900 border-slate-800'
      }`}>
        <div className="flex flex-col md:flex-row items-center gap-3">
          
          <div className="relative flex-1 w-full">
            <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${
              esClaro ? 'text-slate-400' : 'text-slate-500'
            }`} />
            <input
              type="text"
              placeholder="Buscar por nombre, correo o teléfono..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className={`w-full text-xs rounded-xl pl-10 pr-4 py-2.5 border focus:outline-none focus:ring-1 focus:ring-teal-500 ${
                esClaro 
                  ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400' 
                  : 'bg-slate-950 border-slate-700 text-white placeholder:text-slate-500'
              }`}
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <select
              value={filtroRol}
              onChange={(e) => setFiltroRol(e.target.value)}
              className={`text-xs rounded-xl px-3 py-2.5 border focus:outline-none focus:ring-1 focus:ring-teal-500 min-w-0 flex-1 md:flex-none ${
                esClaro 
                  ? 'bg-slate-50 border-slate-200 text-slate-900' 
                  : 'bg-slate-950 border-slate-700 text-white'
              }`}
            >
              <option value="todos">Todos los Roles</option>
              <option value="admin">Administrador (Control Total)</option>
              <option value="gerente">Gerente (Monitoreo)</option>
              <option value="vendedor">Vendedor (Campo)</option>
              <option value="teletransferencista">Teletransferencista</option>
            </select>

            <select
              value={filtroEquipo}
              onChange={(e) => setFiltroEquipo(e.target.value)}
              className={`text-xs rounded-xl px-3 py-2.5 border focus:outline-none focus:ring-1 focus:ring-teal-500 min-w-0 flex-1 md:flex-none ${
                esClaro 
                  ? 'bg-slate-50 border-slate-200 text-slate-900' 
                  : 'bg-slate-950 border-slate-700 text-white'
              }`}
            >
              <option value="todos">Todos los Equipos</option>
              <option value="La Sante">La Santé</option>
              <option value="Comercial">Comercial</option>
              <option value="OTC">OTC</option>
              <option value="TODOS">Corporativo / Todos</option>
            </select>
          </div>

        </div>
      </div>

      {/* Lista de Usuarios: Tarjetas en Móvil y Tabla en Desktop */}
      <div className={`rounded-2xl border overflow-hidden shadow-sm ${
        esClaro ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
      }`}>
        
        {/* VISTA MÓVIL: Tarjetas Táctiles */}
        <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800">
          {usuariosFiltrados.map((u) => {
            const esUsuarioActivo = usuarioActual?.id === u.id;
            return (
              <div key={u.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#001428] dark:text-white truncate">
                        {u.nombre_completo}
                      </span>
                      {esUsuarioActivo && (
                        <span className="text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded">
                          TÚ
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{u.email}</span>
                    </div>
                    {u.telefono && (
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                        <Phone className="w-3 h-3 shrink-0" />
                        <span>{u.telefono}</span>
                      </div>
                    )}
                  </div>

                  {/* Badge de Rol */}
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border shrink-0 ${
                    u.rol === 'admin'
                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                      : u.rol === 'gerente'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : u.rol === 'teletransferencista'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-teal-50 text-teal-700 border-teal-200'
                  }`}>
                    {u.rol}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-[11px]">Equipo:</span>
                    <span className="font-semibold text-[#001428] dark:text-slate-200">
                      {u.equipo}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onSimularUsuario(u)}
                      className="px-2.5 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 font-semibold text-xs flex items-center gap-1 min-h-[40px]"
                      title="Probar sesión como este usuario"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Ingresar</span>
                    </button>

                    <button
                      onClick={() => setModalResetAbierto(u)}
                      className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 min-h-[40px] min-w-[40px] flex items-center justify-center"
                      title="Restablecer contraseña"
                      aria-label="Restablecer clave"
                    >
                      <Key className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* VISTA ESCRITORIO: Tabla Completa */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={`border-b text-[11px] uppercase tracking-wider font-semibold ${
              esClaro ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-slate-950 text-slate-400 border-slate-800'
            }`}>
              <tr>
                <th className="py-3 px-4">Usuario / Nombre</th>
                <th className="py-3 px-3">Correo Electrónico</th>
                <th className="py-3 px-3">Rol Operativo</th>
                <th className="py-3 px-3">Equipo de Ventas</th>
                <th className="py-3 px-3 text-center">Estado</th>
                <th className="py-3 px-4 text-right">Acciones de Acceso</th>
              </tr>
            </thead>
            <tbody className={`divide-y font-normal ${
              esClaro ? 'divide-slate-200 text-slate-700' : 'divide-slate-800 text-slate-300'
            }`}>
              {usuariosFiltrados.map((u) => {
                const esUsuarioActivo = usuarioActual?.id === u.id;
                return (
                  <tr key={u.id} className={esClaro ? 'hover:bg-slate-50/80' : 'hover:bg-slate-800/40'}>
                    
                    <td className="py-3 px-4">
                      <div className="font-bold flex items-center gap-2 text-[#001428] dark:text-white">
                        <span>{u.nombre_completo}</span>
                        {esUsuarioActivo && (
                          <span className="text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded">
                            TÚ
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {u.telefono || 'Sin teléfono'} · ID: <span className="font-mono">{u.id.slice(0, 11)}</span>
                      </div>
                    </td>

                    <td className="py-3 px-3 font-mono text-xs">
                      {u.email}
                    </td>

                    <td className="py-3 px-3">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border inline-flex items-center gap-1 ${
                        u.rol === 'admin'
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : u.rol === 'gerente'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : u.rol === 'teletransferencista'
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : 'bg-teal-50 text-teal-700 border-teal-200'
                      }`}>
                        {u.rol === 'admin' && <ShieldCheck className="w-3 h-3" />}
                        {u.rol === 'gerente' && <Users className="w-3 h-3" />}
                        {u.rol === 'vendedor' && <User className="w-3 h-3" />}
                        {u.rol === 'teletransferencista' && <Layers className="w-3 h-3" />}
                        <span>{u.rol}</span>
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        u.equipo === 'La Sante'
                          ? 'bg-amber-100 text-amber-800'
                          : u.equipo === 'Comercial'
                          ? 'bg-indigo-100 text-indigo-800'
                          : u.equipo === 'OTC'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {u.equipo}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-center">
                      <span className={`w-2 h-2 rounded-full inline-block mr-1.5 ${u.activo ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <span className="text-[11px] font-medium">{u.activo ? 'Activo' : 'Inactivo'}</span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onSimularUsuario(u)}
                          className="px-2.5 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-xs"
                          title="Iniciar sesión inmediatamente con este usuario para pruebas"
                        >
                          <LogIn className="w-3.5 h-3.5" />
                          <span>Iniciar Sesión</span>
                        </button>

                        <button
                          onClick={() => setModalResetAbierto(u)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                          title="Restablecer Contraseña"
                          aria-label="Restablecer clave"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                      </div>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Crear Nuevo Usuario */}
      {modalCrearAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className={`p-5 sm:p-6 rounded-2xl border max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto ${
            esClaro ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${
              esClaro ? 'border-slate-200' : 'border-slate-800'
            }`}>
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                <h3 className="text-base font-bold">
                  Registrar nuevo usuario en NOVA
                </h3>
              </div>
              <button
                onClick={() => setModalCrearAbierto(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCrearSubmit} className="space-y-3.5 text-xs">
              
              <div>
                <label className="block font-bold mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Lic. Marcos Cárdenas"
                  value={formNuevo.nombre_completo}
                  onChange={(e) => setFormNuevo({ ...formNuevo, nombre_completo: e.target.value })}
                  className={`w-full rounded-xl p-2.5 border focus:outline-none focus:ring-1 focus:ring-teal-500 ${
                    esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                  }`}
                />
              </div>

              <div>
                <label className="block font-bold mb-1">Correo Electrónico (Login) *</label>
                <input
                  type="email"
                  required
                  placeholder="marcos.cardenas@pharma.com"
                  value={formNuevo.email}
                  onChange={(e) => setFormNuevo({ ...formNuevo, email: e.target.value })}
                  className={`w-full rounded-xl p-2.5 border focus:outline-none focus:ring-1 focus:ring-teal-500 ${
                    esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                  }`}
                />
              </div>

              <div>
                <label className="block font-bold mb-1">Contraseña Inicial *</label>
                <input
                  type="password"
                  required
                  placeholder="Mínimo 6 caracteres"
                  value={formNuevo.password}
                  onChange={(e) => setFormNuevo({ ...formNuevo, password: e.target.value })}
                  className={`w-full rounded-xl p-2.5 border focus:outline-none focus:ring-1 focus:ring-teal-500 ${
                    esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Rol Operativo *</label>
                  <select
                    value={formNuevo.rol}
                    onChange={(e) => {
                      const nuevoRol = e.target.value as RolUsuario;
                      setFormNuevo({
                        ...formNuevo,
                        rol: nuevoRol,
                        equipo: nuevoRol === 'vendedor' ? 'La Sante' : 'TODOS',
                      });
                    }}
                    className={`w-full rounded-xl p-2.5 border focus:outline-none focus:ring-1 focus:ring-teal-500 ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  >
                    <option value="vendedor">Vendedor (Campo / Pedidos)</option>
                    <option value="gerente">Gerente (Monitoreo)</option>
                    <option value="teletransferencista">Teletransferencista</option>
                    <option value="admin">Administrador (Control Total)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold mb-1">Equipo de Ventas *</label>
                  <select
                    value={formNuevo.equipo}
                    onChange={(e) => setFormNuevo({ ...formNuevo, equipo: e.target.value as EquipoVentas })}
                    disabled={formNuevo.rol !== 'vendedor'}
                    className={`w-full rounded-xl p-2.5 border focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50 ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  >
                    <option value="La Sante">Equipo La Santé</option>
                    <option value="Comercial">Equipo Comercial</option>
                    <option value="OTC">Equipo OTC</option>
                    <option value="TODOS">TODOS (Corporativo)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1">Teléfono Móvil (Opcional)</label>
                <input
                  type="text"
                  placeholder="0412-1234567"
                  value={formNuevo.telefono}
                  onChange={(e) => setFormNuevo({ ...formNuevo, telefono: e.target.value })}
                  className={`w-full rounded-xl p-2.5 border focus:outline-none focus:ring-1 focus:ring-teal-500 ${
                    esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                  }`}
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalCrearAbierto(false)}
                  className="px-4 py-2.5 rounded-xl font-semibold border border-slate-200 hover:bg-slate-100 min-h-[44px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-sm min-h-[44px]"
                >
                  Crear Usuario
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Modal: Restablecer Contraseña */}
      {modalResetAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className={`p-5 sm:p-6 rounded-2xl border max-w-md w-full shadow-2xl space-y-4 ${
            esClaro ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${
              esClaro ? 'border-slate-200' : 'border-slate-800'
            }`}>
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-teal-600" />
                <h3 className="text-base font-bold">
                  Restablecer Contraseña
                </h3>
              </div>
              <button
                onClick={() => setModalResetAbierto(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Establecer una nueva clave para <b>{modalResetAbierto.nombre_completo}</b> ({modalResetAbierto.email}):
            </p>

            <form onSubmit={handleResetPassword} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1">Nueva Clave *</label>
                <input
                  type="password"
                  required
                  placeholder="Mínimo 6 caracteres"
                  value={nuevaPassword}
                  onChange={(e) => setNuevaPassword(e.target.value)}
                  className={`w-full rounded-xl p-2.5 border focus:outline-none focus:ring-1 focus:ring-teal-500 ${
                    esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                  }`}
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalResetAbierto(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 min-h-[44px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-sm min-h-[44px]"
                >
                  Guardar Nueva Clave
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
