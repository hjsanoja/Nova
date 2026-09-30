// Avisos al teléfono. Dos caminos que se complementan:
//  1) Web Push: el servidor los envía aunque la app esté cerrada (requiere configurar la Edge Function una vez).
//  2) Avisos locales: con la app abierta o en segundo plano, lo que llega por la sincronización se muestra como aviso.
import type { SupabaseClient } from '@supabase/supabase-js';

export type EstadoPermiso = 'no_soportado' | 'default' | 'granted' | 'denied';

export const permisoAvisos = (): EstadoPermiso =>
  typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator) ? 'no_soportado' : (Notification.permission as EstadoPermiso);

const b64aBytes = (b64: string) => {
  const base = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base), (c) => c.charCodeAt(0));
};
const bytesAB64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Clave pública VAPID configurada por el administrador (null si los avisos con la app cerrada no están activos). */
async function clavePublica(sb: SupabaseClient): Promise<string | null> {
  const { data } = await sb.from('config_sistema').select('valor').eq('clave', 'push_vapid_publica').maybeSingle();
  const v = (data as { valor?: unknown } | null)?.valor;
  return typeof v === 'string' && v.length > 40 ? v : null;
}

/**
 * Pide permiso y, si el servidor está configurado, suscribe este teléfono. Devuelve si quedó con avisos "completos"
 * (también con la app cerrada) o solo locales.
 */
export async function activarAvisos(sb: SupabaseClient | null, dispositivo: string): Promise<'completos' | 'locales'> {
  if (permisoAvisos() === 'no_soportado') throw new Error('Este navegador no permite avisos. En Android usa Chrome; en iPhone, instala la app en la pantalla de inicio.');
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error('Los avisos quedaron bloqueados. Actívalos en los ajustes del navegador para esta página.');
  if (!sb) return 'locales';
  const clave = await clavePublica(sb);
  if (!clave) return 'locales';
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aBytes(clave) });
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const { error } = await sb.rpc('guardar_suscripcion_push', { p: { endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth, dispositivo } });
  if (error) throw new Error(error.message);
  return 'completos';
}

export async function desactivarAvisos(sb: SupabaseClient | null): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  if (sb) await sb.rpc('quitar_suscripcion_push', { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}

/** ¿Este teléfono ya está suscrito a los avisos con la app cerrada? */
export async function suscrito(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(await reg?.pushManager.getSubscription());
}

/** Muestra un aviso del sistema (a través del service worker, que es lo que funciona en Android). */
export async function mostrarAviso(titulo: string, cuerpo: string, tag: string, url = './'): Promise<void> {
  if (permisoAvisos() !== 'granted') return;
  const reg = await navigator.serviceWorker.getRegistration();
  const opciones = { body: cuerpo, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url } };
  if (reg) await reg.showNotification(titulo, opciones);
  else new Notification(titulo, opciones);
}

/** Genera las claves VAPID (P-256) y una clave para que la base llame a la Edge Function. Solo en el navegador del admin. */
export async function generarClavesAvisos(): Promise<{ publica: string; privada: string; secreto: string }> {
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publica = bytesAB64(await crypto.subtle.exportKey('raw', par.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', par.privateKey);
  const secreto = bytesAB64(crypto.getRandomValues(new Uint8Array(32)));
  return { publica, privada: jwk.d!, secreto };
}
