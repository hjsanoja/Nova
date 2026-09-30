// Diagnóstico de la conexión con Supabase ANTES de guardarla: distingue URL inalcanzable, clave de otro proyecto,
// clave secreta y clave inválida, para que el usuario sepa exactamente qué corregir. Sin dependencia del SDK.
import { limpiarSupabaseAnonKey, limpiarSupabaseUrl } from './supabaseConfig';

export interface Diagnostico {
  ok: boolean;
  mensaje: string;
}

/** Lee el contenido de una clave JWT (las claves "anon" y "service_role" antiguas). null si no es un JWT. */
function payloadJwt(clave: string): Record<string, unknown> | null {
  const partes = clave.split('.');
  if (partes.length !== 3 || !clave.startsWith('eyJ')) return null;
  try {
    const b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '='))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Identificador del proyecto en https://<ref>.supabase.co (null en dominios propios o locales). */
export function refDeUrl(url: string): string | null {
  const m = /^https?:\/\/([a-z0-9]+)\.supabase\.(co|in)$/i.exec(url);
  return m ? m[1].toLowerCase() : null;
}

/** Revisa la clave sin conectarse. Devuelve el problema encontrado o null si parece correcta. */
export function revisarClave(url: string, clave: string): string | null {
  if (/^sb_secret_/i.test(clave)) {
    return 'Pegaste la clave SECRETA (sb_secret_…). Nunca la uses en la app: copia la clave "publishable" (sb_publishable_…) o la "anon" (Project Settings → API Keys).';
  }
  if (/^sb_publishable_/i.test(clave)) return null;
  const jwt = payloadJwt(clave);
  if (!jwt) {
    return 'La clave no tiene el formato esperado. Debe empezar por "sb_publishable_" o por "eyJ" (clave anon). Cópiala de nuevo, completa, desde Project Settings → API Keys.';
  }
  if (jwt.role === 'service_role') {
    return 'Pegaste la clave service_role (secreta). Nunca la uses en la app: copia la clave "anon" o la "publishable".';
  }
  const refUrl = refDeUrl(url);
  if (refUrl && typeof jwt.ref === 'string' && jwt.ref.toLowerCase() !== refUrl) {
    return `La clave es de otro proyecto (${jwt.ref}) y la URL es del proyecto ${refUrl}. Copia las dos del mismo proyecto.`;
  }
  return null;
}

/**
 * Comprueba URL y clave contra el servicio de acceso de Supabase (/auth/v1/settings, público con la clave del proyecto).
 * `fetchFn` se inyecta en las pruebas.
 */
export async function diagnosticarConexion(urlCruda: string, claveCruda: string, fetchFn: typeof fetch = fetch): Promise<Diagnostico> {
  const url = limpiarSupabaseUrl(urlCruda);
  const clave = limpiarSupabaseAnonKey(claveCruda);
  if (!url || !clave) return { ok: false, mensaje: 'Escribe la URL y la clave de tu proyecto.' };
  if (!/^https:\/\/[^/\s]+$/i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url)) {
    return { ok: false, mensaje: `La URL "${url}" no es válida. Debe ser como https://abcdefghijklmnop.supabase.co (Project Settings → Data API → Project URL).` };
  }
  const problemaClave = revisarClave(url, clave);
  if (problemaClave) return { ok: false, mensaje: problemaClave };

  let res: Response;
  try {
    res = await fetchFn(`${url}/auth/v1/settings`, { headers: { apikey: clave } });
  } catch {
    return {
      ok: false,
      mensaje: `No se pudo llegar a ${url}. Revisa que la URL esté bien escrita (copiada de Project Settings → Data API → Project URL), que tengas internet y que ningún bloqueador de anuncios, antivirus o red de la empresa bloquee supabase.co.`,
    };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, mensaje: 'Supabase rechazó la clave: no corresponde a este proyecto o está desactivada. Cópiala de nuevo desde Project Settings → API Keys.' };
  }
  if (res.status === 404) {
    return { ok: false, mensaje: `En ${url} no hay un proyecto de Supabase. Revisa la URL (Project Settings → Data API → Project URL).` };
  }
  if (!res.ok) {
    return { ok: false, mensaje: `Supabase respondió con un error (${res.status}). Si el proyecto está recién creado o pausado, espera un par de minutos y vuelve a probar.` };
  }
  return { ok: true, mensaje: 'La URL y la clave son correctas.' };
}
