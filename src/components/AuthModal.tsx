import React, { useState } from 'react';
import { Usuario } from '../types/pharmacy';
import { MOCK_USUARIOS } from '../data/mockData';
import { getSupabaseClient } from '../services/supabaseClient';
import { 
  Lock, 
  Mail, 
  Key, 
  Check, 
  AlertCircle, 
  RefreshCw, 
  X, 
  ShieldCheck, 
} from 'lucide-react';

interface AuthModalProps {
  abierto: boolean;
  onCerrar: () => void;
  usuarioActual: Usuario | null;
  onUsuarioAutenticado: (usuario: Usuario) => void;
  onCerrarSesion: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  abierto,
  onCerrar,
  usuarioActual,
  onUsuarioAutenticado,
  onCerrarSesion,
}) => {
  const [modo, setModo] = useState<'login' | 'recuperar'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  if (!abierto) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    setMensaje(null);

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });

        if (error) {
          setMensaje({ tipo: 'error', texto: `Error Supabase Auth: ${error.message}` });
        } else if (data.user) {
          const userMapeado: Usuario = {
            id: data.user.id,
            email: data.user.email || email,
            nombre_completo: data.user.user_metadata?.nombre_completo || email.split('@')[0],
            rol: data.user.user_metadata?.rol || 'vendedor',
            equipo: data.user.user_metadata?.equipo || 'A',
            activo: true,
            created_at: data.user.created_at,
          };
          onUsuarioAutenticado(userMapeado);
          setMensaje({ tipo: 'exito', texto: '¡Sesión iniciada con éxito en Supabase Auth!' });
          setTimeout(() => onCerrar(), 1200);
          return;
        }
      } catch (err: any) {
        setMensaje({ tipo: 'error', texto: `Fallo de autenticación: ${err.message}` });
      }
    } else {
      // Modo Mock Local: buscar coincidencia en MOCK_USUARIOS o autenticar
      const mockMatch = MOCK_USUARIOS.find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (mockMatch) {
        onUsuarioAutenticado(mockMatch);
        setMensaje({ tipo: 'exito', texto: `¡Bienvenido, ${mockMatch.nombre_completo}!` });
        setTimeout(() => onCerrar(), 1200);
      } else {
        const nuevo: Usuario = {
          id: `usr-custom-${Date.now()}`,
          email,
          nombre_completo: email.split('@')[0],
          rol: 'vendedor',
          equipo: 'A',
          activo: true,
          created_at: new Date().toISOString(),
        };
        onUsuarioAutenticado(nuevo);
        setMensaje({ tipo: 'exito', texto: `Sesión iniciada como ${nuevo.nombre_completo}` });
        setTimeout(() => onCerrar(), 1200);
      }
    }
    setCargando(false);
  };

  const handleRecuperarClave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setMensaje({ tipo: 'error', texto: 'Por favor ingresa tu correo electrónico.' });
      return;
    }

    setCargando(true);
    setMensaje(null);

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/#reset-password`,
        });

        if (error) {
          setMensaje({ tipo: 'error', texto: `Error al enviar correo: ${error.message}` });
        } else {
          setMensaje({
            tipo: 'exito',
            texto: `Se ha enviado un enlace de recuperación nativo de Supabase a ${email}.`,
          });
        }
      } catch (err: any) {
        setMensaje({ tipo: 'error', texto: err.message });
      }
    } else {
      setMensaje({
        tipo: 'exito',
        texto: `Simulación: Enlace de recuperación generado para ${email}. En producción Supabase enviará el token de cambio de clave.`,
      });
    }
    setCargando(false);
  };

  const handleSeleccionarUsuarioPrueba = (user: Usuario) => {
    onUsuarioAutenticado(user);
    setMensaje({ tipo: 'exito', texto: `Cambiado a perfil: ${user.nombre_completo} (${user.rol.toUpperCase()})` });
    setTimeout(() => onCerrar(), 1000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
        
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-teal-400" />
            <h3 className="text-base font-bold text-white">
              {modo === 'login' ? 'Iniciar Sesión • Supabase Auth' : 'Recuperar Contraseña'}
            </h3>
          </div>
          <button
            onClick={onCerrar}
            className="text-slate-400 hover:text-white text-lg font-bold"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notificaciones */}
        {mensaje && (
          <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            mensaje.tipo === 'exito'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}>
            {mensaje.tipo === 'exito' ? (
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{mensaje.texto}</span>
          </div>
        )}

        {/* Formulario de Login / Recuperar */}
        {modo === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-300 font-bold mb-1">Correo Electrónico</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  placeholder="usuario@pharma.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white placeholder:text-slate-600 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-slate-300 font-bold">Contraseña</label>
                <button
                  type="button"
                  onClick={() => setModo('recuperar')}
                  className="text-teal-400 hover:underline text-[11px]"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <div className="relative">
                <Key className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white placeholder:text-slate-600 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={cargando}
              className="w-full py-2.5 rounded-xl font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 transition-all shadow-md flex items-center justify-center gap-2"
            >
              {cargando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              <span>Iniciar Sesión</span>
            </button>
          </form>
        ) : (
          <form onSubmit={handleRecuperarClave} className="space-y-3 text-xs">
            <p className="text-slate-300 text-[11px]">
              Ingresa tu correo para recibir un enlace oficial de Supabase con el que podrás restablecer tu contraseña.
            </p>

            <div>
              <label className="block text-slate-300 font-bold mb-1">Correo Electrónico</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  placeholder="usuario@pharma.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white placeholder:text-slate-600 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setModo('login')}
                className="w-1/2 py-2 rounded-xl text-slate-400 hover:text-white"
              >
                Volver al Login
              </button>

              <button
                type="submit"
                disabled={cargando}
                className="w-1/2 py-2 rounded-xl font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 shadow flex items-center justify-center gap-1.5"
              >
                {cargando ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                Enviar Enlace
              </button>
            </div>
          </form>
        )}

        {/* Perfiles de Prueba Rápidos para Demostración */}
        <div className="pt-3 border-t border-slate-800 space-y-2">
          <span className="text-[11px] font-bold text-slate-400 block">
            Acceso Rápido por Rol (Demostración de Permisos y Menús):
          </span>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {MOCK_USUARIOS.map((u) => (
              <button
                key={u.id}
                onClick={() => handleSeleccionarUsuarioPrueba(u)}
                className="p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left transition-colors"
              >
                <div className="font-bold text-white text-[11px] truncate">{u.nombre_completo}</div>
                <div className="text-[10px] text-teal-400 uppercase font-semibold">
                  {u.rol} • Eq. {u.equipo}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Cerrar Sesión si ya está autenticado */}
        {usuarioActual && (
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400 text-[11px]">
              Sesión activa: <b className="text-white">{usuarioActual.nombre_completo}</b>
            </span>
            <button
              onClick={() => {
                onCerrarSesion();
                onCerrar();
              }}
              className="text-red-400 hover:underline text-[11px] font-bold"
            >
              Cerrar Sesión
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
