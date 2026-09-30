// Configuración de conexión a Supabase. Sin dependencia de @supabase/supabase-js,
// para que el arranque de la app no cargue el SDK si no se usa.
const STORAGE_KEY_URL = 'PHARMA_SUPABASE_URL';
const STORAGE_KEY_ANON_KEY = 'PHARMA_SUPABASE_ANON_KEY';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isConnected: boolean;
}

function leerAlmacenado(clave: string): string {
  try {
    return localStorage.getItem(clave) || '';
  } catch {
    return '';
  }
}

/**
 * Limpia y normaliza la URL de Supabase para evitar errores de ruta (Invalid path specified in request URL).
 * Soporta URLs del dashboard, URLs con /rest/v1 pegado por error, trailing slashes o IDs de proyecto.
 */
export function limpiarSupabaseUrl(raw: string): string {
  if (!raw) return '';
  let url = raw.trim().replace(/^['"`]+|['"`]+$/g, '');

  // 1. Si el usuario pegó la URL del panel de control de Supabase (ej: https://supabase.com/dashboard/project/abcdefgh...)
  const matchDashboard = url.match(/(?:supabase\.com|supabase\.co)\/(?:dashboard\/)?project\/([a-z0-9_-]+)/i);
  if (matchDashboard && matchDashboard[1]) {
    return `https://${matchDashboard[1]}.supabase.co`;
  }

  // 1b. Si pegó la cadena de conexión de PostgreSQL (postgresql://postgres:…@db.<ref>.supabase.co:5432/postgres o la del
  //     pooler, postgres.<ref>:…@aws-….pooler.supabase.com): el proyecto está dentro.
  const matchPostgres = url.match(/@db\.([a-z0-9]+)\.supabase\.co/i) ?? url.match(/^postgres(?:ql)?:\/\/postgres\.([a-z0-9]+)[:@]/i);
  if (matchPostgres && matchPostgres[1]) {
    return `https://${matchPostgres[1].toLowerCase()}.supabase.co`;
  }

  // 2. Si pegó solo el identificador de 20 caracteres del proyecto (ej: ct4r32pdnto5qmx24uakdb)
  if (/^[a-z0-9]{15,30}$/i.test(url) && !url.includes('.')) {
    return `https://${url}.supabase.co`;
  }

  // 3. Asegurar protocolo https://
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  try {
    const parsed = new URL(url);
    // Eliminar paths como /rest/v1 o /auth/v1 o trailing slashes si el usuario los copió
    return `${parsed.protocol}//${parsed.host}`.replace(/\/+$/, '');
  } catch {
    return url.replace(/\/+$/, '');
  }
}

export function limpiarSupabaseAnonKey(raw: string): string {
  if (!raw) return '';
  return raw.trim().replace(/^['"`]+|['"`]+$/g, '').replace(/\s+/g, '');
}

export function getStoredSupabaseConfig(): SupabaseConfig {
  const urlRaw = (leerAlmacenado(STORAGE_KEY_URL) || import.meta.env.VITE_SUPABASE_URL || '').trim();
  const anonKeyRaw = (leerAlmacenado(STORAGE_KEY_ANON_KEY) || import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  const url = limpiarSupabaseUrl(urlRaw);
  const anonKey = limpiarSupabaseAnonKey(anonKeyRaw);
  return { url, anonKey, isConnected: !!(url && anonKey) };
}

export function saveSupabaseConfig(url: string, anonKey: string): void {
  const cleanUrl = limpiarSupabaseUrl(url);
  const cleanKey = limpiarSupabaseAnonKey(anonKey);
  localStorage.setItem(STORAGE_KEY_URL, cleanUrl);
  localStorage.setItem(STORAGE_KEY_ANON_KEY, cleanKey);
}

export function clearSupabaseConfig(): void {
  localStorage.removeItem(STORAGE_KEY_URL);
  localStorage.removeItem(STORAGE_KEY_ANON_KEY);
}

/** Parámetro del enlace que trae la conexión ya puesta (URL y clave pública "anon", que no es secreta). */
const PARAM_ENLACE = 'conexion';

/** Enlace de la app con la conexión incluida: quien lo abre no tiene que escribir la URL ni la clave. */
export function enlaceConConexion(base = `${location.origin}${location.pathname}`): string {
  const { url, anonKey } = getStoredSupabaseConfig();
  if (!url || !anonKey) return base;
  const valor = btoa(`${url}|${anonKey}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${base}?${PARAM_ENLACE}=${valor}`;
}

/** Al abrir un enlace con `?conexion=…` se guarda la conexión y se limpia la barra de direcciones. Devuelve si la aplicó. */
export function aplicarConexionDelEnlace(): boolean {
  try {
    const params = new URLSearchParams(location.search);
    const valor = params.get(PARAM_ENLACE);
    if (!valor) return false;
    const [url, anonKey] = atob(valor.replace(/-/g, '+').replace(/_/g, '/')).split('|');
    params.delete(PARAM_ENLACE);
    const resto = params.toString();
    history.replaceState(null, '', `${location.pathname}${resto ? `?${resto}` : ''}${location.hash}`);
    if (!url || !anonKey || !/^https?:\/\//.test(url)) return false;
    saveSupabaseConfig(url, anonKey);
    return true;
  } catch {
    return false;
  }
}
