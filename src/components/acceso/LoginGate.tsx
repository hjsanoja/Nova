import React, { useState } from 'react';
import { LogIn, Settings2 } from 'lucide-react';
import type { Usuario } from '../../types/pharmacy';
import { getStoredSupabaseConfig } from '../../services/supabaseConfig';
import { iniciarSesionNube, recuperarPasswordNube, USUARIO_DEMO } from '../../services/sesion';
import { useTheme } from '../../context/ThemeContext';
import { NovaLogo } from '../NovaLogo';
import { Boton, estiloInput } from '../ui/kit';
import { ConexionForm } from './ConexionForm';

interface Props {
  onEntrar: (usuario: Usuario) => void;
  /** Se llama cuando cambia la conexión con Supabase (guardada o quitada). */
  onConexionCambiada: () => void;
}

/** Pantalla de acceso: nadie ve datos sin iniciar sesión. Sin Supabase configurado ofrece conectar o probar en modo demostración. */
export const LoginGate: React.FC<Props> = ({ onEntrar, onConexionCambiada }) => {
  const { esClaro } = useTheme();
  const conectado = getStoredSupabaseConfig().isConnected;
  const [cambiandoConexion, setCambiandoConexion] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    setError('');
    setInfo('');
    try {
      onEntrar(await iniciarSesionNube(email, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCargando(false);
    }
  };

  const recuperar = async () => {
    if (!email.trim()) return setError('Escribe tu correo y vuelve a tocar "Olvidé mi contraseña".');
    setError('');
    try {
      await recuperarPasswordNube(email);
      setInfo(`Te enviamos un enlace a ${email.trim()} para crear una contraseña nueva.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const mostrarConexion = !conectado || cambiandoConexion;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex justify-center">
          <NovaLogo size="lg" esClaro={esClaro} />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {mostrarConexion ? (
            <>
              <h1 className="text-base font-bold text-slate-900 dark:text-white">{conectado ? 'Conexión con Supabase' : 'Conecta tu proyecto'}</h1>
              <p className="mb-3 mt-0.5 text-xs text-slate-500 dark:text-slate-400">Una sola vez por dispositivo. Después inicias sesión con tu correo.</p>
              <ConexionForm
                permitirQuitar={conectado}
                onCambio={() => {
                  setCambiandoConexion(false);
                  onConexionCambiada();
                }}
              />
              {conectado ? (
                <button type="button" onClick={() => setCambiandoConexion(false)} className="mt-3 w-full text-center text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300">
                  Volver al inicio de sesión
                </button>
              ) : (
                <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
                  <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">¿Solo quieres ver cómo funciona? Usa datos de ejemplo; nada se guarda en la nube.</p>
                  <Boton className="w-full" onClick={() => onEntrar(USUARIO_DEMO)}>
                    Probar en modo demostración
                  </Boton>
                </div>
              )}
            </>
          ) : (
            <form onSubmit={entrar} className="space-y-3">
              <h1 className="text-base font-bold text-slate-900 dark:text-white">Iniciar sesión</h1>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Correo
                <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={`${estiloInput} mt-1`} />
              </label>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Contraseña
                <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${estiloInput} mt-1`} />
              </label>
              {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>}
              {info && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">{info}</p>}
              <Boton type="submit" variante="primario" icono={LogIn} disabled={cargando} className="w-full">
                {cargando ? 'Entrando…' : 'Entrar'}
              </Boton>
              <div className="flex items-center justify-between pt-1 text-xs">
                <button type="button" onClick={recuperar} className="font-semibold text-teal-700 hover:underline dark:text-teal-300">
                  Olvidé mi contraseña
                </button>
                <button type="button" onClick={() => setCambiandoConexion(true)} className="inline-flex items-center gap-1 text-slate-500 hover:underline">
                  <Settings2 className="h-3.5 w-3.5" /> Conexión
                </button>
              </div>
            </form>
          )}
        </div>
        <p className="mt-4 text-center text-[11px] text-slate-500">Si no tienes cuenta, pídesela a un administrador.</p>
      </div>
    </div>
  );
};
