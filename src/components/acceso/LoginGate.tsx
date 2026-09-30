import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, LogIn, Settings2 } from 'lucide-react';
import type { Usuario } from '../../types/pharmacy';
import { getStoredSupabaseConfig } from '../../services/supabaseConfig';
import { iniciarSesionNube, recuperarPasswordNube, USUARIO_DEMO } from '../../services/sesion';
import { useTheme } from '../../context/ThemeContext';
import { NovaLogo } from '../NovaLogo';
import { FirmaVersion } from '../version/Version';
import { Boton, estiloInput } from '../ui/kit';
import { ConexionForm } from './ConexionForm';

interface Props {
  onEntrar: (usuario: Usuario) => void;
  /** Se llama cuando cambia la conexión con Supabase (guardada o quitada). */
  onConexionCambiada: () => void;
}

/**
 * Pide al navegador guardar la contraseña (Chrome y Android la ofrecen la próxima vez). La contraseña nunca se guarda en la
 * app: la guarda el administrador de contraseñas del navegador o del teléfono.
 */
function guardarEnNavegador(email: string, password: string, nombre: string) {
  try {
    const W = window as unknown as { PasswordCredential?: new (d: { id: string; password: string; name?: string }) => unknown };
    const cred = (navigator as Navigator & { credentials?: { store?: (c: unknown) => Promise<unknown> } }).credentials;
    if (W.PasswordCredential && cred?.store) void cred.store(new W.PasswordCredential({ id: email.trim(), password, name: nombre })).catch(() => undefined);
  } catch {
    /* el navegador no lo permite: se ignora */
  }
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
  const [verPassword, setVerPassword] = useState(false);

  // Si el navegador guardó la contraseña (Chrome/Android), se ofrece para rellenar los campos sin tener que escribirla.
  useEffect(() => {
    const cred = (navigator as Navigator & { credentials?: { get?: (o: object) => Promise<unknown> } }).credentials;
    if (!cred?.get || !('PasswordCredential' in window)) return;
    let vivo = true;
    cred.get({ password: true, mediation: 'optional' }).then(
      (c) => {
        const p = c as { id?: string; password?: string } | null;
        if (vivo && p?.id && p.password) {
          setEmail(p.id);
          setPassword(p.password);
        }
      },
      () => undefined
    );
    return () => {
      vivo = false;
    };
  }, []);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    setError('');
    setInfo('');
    try {
      const usuario = await iniciarSesionNube(email, password);
      guardarEnNavegador(email, password, usuario.nombre_completo);
      onEntrar(usuario);
    } catch (err) {
      setError(explicar(err));
    } finally {
      setCargando(false);
    }
  };

  /** Sin respuesta del servidor: se dice a qué dirección se intentó llegar y cómo revisarla. */
  const explicar = (err: unknown) => {
    const texto = err instanceof Error ? err.message : String(err);
    if (!texto.startsWith('No hay conexión con el servidor')) return texto;
    const detalle = /\(Detalle: (.*)\)$/.exec(texto)?.[1];
    return `No se pudo conectar con ${getStoredSupabaseConfig().url}${detalle ? ` (${detalle})` : ''}. Toca «Conexión» y luego «Probar y guardar» para revisar la URL y la clave.`;
  };

  const recuperar = async () => {
    if (!email.trim()) return setError('Escribe tu correo y vuelve a tocar "Olvidé mi contraseña".');
    setError('');
    try {
      await recuperarPasswordNube(email);
      setInfo(`Te enviamos un enlace a ${email.trim()} para crear una contraseña nueva.`);
    } catch (err) {
      setError(explicar(err));
    }
  };

  const mostrarConexion = !conectado || cambiandoConexion;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex justify-center">
          <NovaLogo size="lg" esClaro={esClaro} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
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
                <button type="button" onClick={() => setCambiandoConexion(false)} className="mt-3 w-full text-center text-xs font-semibold text-marca-700 hover:underline dark:text-marca-300">
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
            <form onSubmit={entrar} method="post" action="#" autoComplete="on" className="space-y-3">
              <h1 className="text-base font-bold text-slate-900 dark:text-white">Iniciar sesión</h1>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Correo
                <input id="email" name="email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={`${estiloInput} mt-1`} />
              </label>
              <div>
                <label htmlFor="password" className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Contraseña</label>
                <div className="relative mt-1">
                  <input id="password" name="password" type={verPassword ? 'text' : 'password'} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${estiloInput} pr-11`} />
                  <button
                    type="button"
                    onClick={() => setVerPassword((v) => !v)}
                    aria-label={verPassword ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
                    aria-pressed={verPassword}
                    className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-lg text-slate-500 hover:text-slate-800 dark:hover:text-white"
                  >
                    {verPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>}
              {info && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">{info}</p>}
              <Boton type="submit" variante="primario" icono={LogIn} disabled={cargando} className="w-full">
                {cargando ? 'Entrando…' : 'Entrar'}
              </Boton>
              <div className="flex items-center justify-between pt-1 text-xs">
                <button type="button" onClick={recuperar} className="font-semibold text-marca-700 hover:underline dark:text-marca-300">
                  Olvidé mi contraseña
                </button>
                <button type="button" onClick={() => setCambiandoConexion(true)} className="inline-flex items-center gap-1 text-slate-500 hover:underline">
                  <Settings2 className="h-3.5 w-3.5" /> Conexión
                </button>
              </div>
            </form>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">Si no tienes cuenta, pídesela a un administrador.</p>
        <div className="mt-6 flex justify-center">
          <FirmaVersion variante="completa" className="px-3 py-2 text-center [&_span]:justify-center" />
        </div>
      </div>
    </div>
  );
};
