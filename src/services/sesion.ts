import type { SupabaseClient } from '@supabase/supabase-js';
import type { Usuario } from '../types/pharmacy';
import { getSupabaseClient } from './supabaseClient';
import { cargarPerfilUsuario } from './nubeV3';
import { VERSION } from '../version';

/**
 * Sesión de la app. Con Supabase configurado, entrar exige correo y contraseña de una cuenta ACTIVA en dim_usuarios;
 * el rol y el equipo salen de esa tabla. Sin Supabase solo existe el modo demostración (datos de ejemplo, sin nube).
 */

export const USUARIO_DEMO: Usuario = {
  id: 'demo',
  email: 'demo@nova.local',
  nombre_completo: 'Usuario de demostración',
  rol: 'admin',
  equipo: 'TODOS',
  activo: true,
  created_at: '2026-01-01T00:00:00.000Z',
};

export function traducirErrorAuth(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Confirma tu correo (revisa tu bandeja) antes de entrar.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed')) return `No hay conexión con el servidor. Revisa tu internet. (Detalle: ${mensaje})`;
  if (m.includes('password should be')) return 'La contraseña es demasiado corta (mínimo 6 caracteres).';
  return mensaje;
}

function requerirCliente(sb: SupabaseClient | null): SupabaseClient {
  if (!sb) throw new Error('Falta conectar con Supabase (URL y clave del proyecto).');
  return sb;
}

/** Perfil autorizado -> usuario de la app. Devuelve un error legible si la cuenta no está activada. */
async function usuarioDesdePerfil(sb: SupabaseClient, id: string, email: string, creado: string): Promise<Usuario> {
  const perfil = await cargarPerfilUsuario(sb, id);
  if (!perfil) throw new Error('Tu cuenta aún no está activada. Pide a un administrador que le asigne rol y equipo.');
  if (!perfil.activo) throw new Error('Tu cuenta está desactivada. Pide a un administrador que la active.');
  return { id, email, nombre_completo: perfil.nombre_completo, rol: perfil.rol, equipo: perfil.equipo, equipo_id: perfil.equipo_id ?? null, gerente_id: perfil.gerente_id ?? null, estado_geografico: perfil.estado_geografico ?? null, telefono: perfil.telefono, activo: true, created_at: creado, guia_vista_en: perfil.guia_vista_en };
}

/** "Android · Chrome", "Windows · Edge"… (sin datos personales): para el reporte de accesos. */
function dispositivo(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const so = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone/iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Otro';
  const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const instalada = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;
  return `${so} · ${nav}${instalada ? ' · app instalada' : ''}`;
}

/** Deja constancia de un acceso (inicio de sesión o apertura de la app). Nunca bloquea ni falla hacia el usuario. */
function registrarAcceso(evento: 'inicio_sesion' | 'apertura', sb: SupabaseClient | null = getSupabaseClient()): void {
  if (!sb || typeof sb.rpc !== 'function') return;
  try {
    const base = { p_evento: evento, p_dispositivo: dispositivo() };
    // Con la versión de la app (reporte de accesos). Si la base aún no tiene esa columna, se registra sin ella.
    void Promise.resolve(sb.rpc('registrar_acceso', { ...base, p_version: VERSION }))
      .then((r) => (r && (r as { error?: unknown }).error ? sb.rpc('registrar_acceso', base) : r))
      .catch(() => undefined);
  } catch {
    /* el registro de accesos nunca impide entrar */
  }
}

export async function iniciarSesionNube(email: string, password: string, sb: SupabaseClient | null = getSupabaseClient()): Promise<Usuario> {
  const cliente = requerirCliente(sb);
  const { data, error } = await cliente.auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.user) throw new Error(traducirErrorAuth(error?.message ?? 'No se pudo iniciar sesión.'));
  try {
    const usuario = await usuarioDesdePerfil(cliente, data.user.id, data.user.email ?? email.trim(), data.user.created_at);
    registrarAcceso('inicio_sesion', cliente);
    return usuario;
  } catch (e) {
    await cliente.auth.signOut();
    throw new Error(traducirErrorAuth(e instanceof Error ? e.message : String(e)));
  }
}

export type RestauracionSesion = { estado: 'ok'; usuario: Usuario } | { estado: 'sin_sesion' } | { estado: 'sin_red' };

/** Al abrir la app: ¿sigue vigente la sesión guardada? Sin red se conserva la cuenta local (la RLS decide al sincronizar). */
export async function restaurarSesionNube(sb: SupabaseClient | null = getSupabaseClient()): Promise<RestauracionSesion> {
  if (!sb) return { estado: 'sin_sesion' };
  try {
    const { data, error } = await sb.auth.getSession();
    if (error) return { estado: navigator.onLine === false ? 'sin_red' : 'sin_sesion' };
    const u = data.session?.user;
    if (!u) return { estado: navigator.onLine === false ? 'sin_red' : 'sin_sesion' };
    const usuario = await usuarioDesdePerfil(sb, u.id, u.email ?? '', u.created_at);
    registrarAcceso('apertura', sb);
    return { estado: 'ok', usuario };
  } catch {
    return { estado: navigator.onLine === false ? 'sin_red' : 'sin_sesion' };
  }
}

export async function cerrarSesionNube(sb: SupabaseClient | null = getSupabaseClient()): Promise<void> {
  try {
    await sb?.auth.signOut();
  } catch {
    /* sin red: la sesión local se elimina igual */
  }
}

export async function cambiarPasswordNube(nueva: string, sb: SupabaseClient | null = getSupabaseClient()): Promise<void> {
  if (nueva.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
  const { error } = await requerirCliente(sb).auth.updateUser({ password: nueva });
  if (error) throw new Error(traducirErrorAuth(error.message));
}

export async function recuperarPasswordNube(email: string, sb: SupabaseClient | null = getSupabaseClient()): Promise<void> {
  const { error } = await requerirCliente(sb).auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
  if (error) throw new Error(traducirErrorAuth(error.message));
}
