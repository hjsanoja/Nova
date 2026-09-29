import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Claves de almacenamiento local para configuración dinámica en el navegador
const STORAGE_KEY_URL = 'PHARMA_SUPABASE_URL';
const STORAGE_KEY_ANON_KEY = 'PHARMA_SUPABASE_ANON_KEY';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isConnected: boolean;
}

export function getStoredSupabaseConfig(): SupabaseConfig {
  const envUrl = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL || '';
  const envKey = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_ANON_KEY || '';

  const localUrl = localStorage.getItem(STORAGE_KEY_URL) || envUrl;
  const localKey = localStorage.getItem(STORAGE_KEY_ANON_KEY) || envKey;

  return {
    url: localUrl.trim(),
    anonKey: localKey.trim(),
    isConnected: !!(localUrl.trim() && localKey.trim()),
  };
}

export function saveSupabaseConfig(url: string, anonKey: string): void {
  localStorage.setItem(STORAGE_KEY_URL, url.trim());
  localStorage.setItem(STORAGE_KEY_ANON_KEY, anonKey.trim());
}

export function clearSupabaseConfig(): void {
  localStorage.removeItem(STORAGE_KEY_URL);
  localStorage.removeItem(STORAGE_KEY_ANON_KEY);
}

let activeClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const config = getStoredSupabaseConfig();
  if (!config.url || !config.anonKey) {
    activeClient = null;
    return null;
  }

  if (!activeClient) {
    try {
      activeClient = createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      });
    } catch (err) {
      console.error('Error al inicializar cliente Supabase:', err);
      return null;
    }
  }

  return activeClient;
}

/**
 * Prueba la conectividad real contra el proyecto Supabase consultando dim_droguerias
 */
export async function probarConexionSupabase(): Promise<{ ok: boolean; mensaje: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      ok: false,
      mensaje: 'Faltan credenciales de Supabase (URL o Anon Key no configuradas).',
    };
  }

  try {
    const { error } = await client
      .from('dim_droguerias')
      .select('codigo_drogueria', { count: 'exact', head: true });

    if (error) {
      return {
        ok: false,
        mensaje: `Error Supabase: ${error.message} (Código: ${error.code || 'N/A'})`,
      };
    }

    return {
      ok: true,
      mensaje: 'Conexión exitosa a Supabase PostgreSQL. Esquema y RLS operativos.',
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      mensaje: `Fallo de red o URL inválida: ${errorMsg}`,
    };
  }
}
