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

export function getStoredSupabaseConfig(): SupabaseConfig {
  const url = (leerAlmacenado(STORAGE_KEY_URL) || import.meta.env.VITE_SUPABASE_URL || '').trim();
  const anonKey = (leerAlmacenado(STORAGE_KEY_ANON_KEY) || import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  return { url, anonKey, isConnected: !!(url && anonKey) };
}

export function saveSupabaseConfig(url: string, anonKey: string): void {
  localStorage.setItem(STORAGE_KEY_URL, url.trim());
  localStorage.setItem(STORAGE_KEY_ANON_KEY, anonKey.trim());
}

export function clearSupabaseConfig(): void {
  localStorage.removeItem(STORAGE_KEY_URL);
  localStorage.removeItem(STORAGE_KEY_ANON_KEY);
}
