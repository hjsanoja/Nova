import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getStoredSupabaseConfig } from './supabaseConfig';

export { getStoredSupabaseConfig, saveSupabaseConfig, clearSupabaseConfig } from './supabaseConfig';
export type { SupabaseConfig } from './supabaseConfig';

let activeClient: SupabaseClient | null = null;
let activeClientKey = '';

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getStoredSupabaseConfig();
  if (!url || !anonKey) {
    activeClient = null;
    activeClientKey = '';
    return null;
  }

  // Si el usuario cambia URL o clave desde el modal, se recrea el cliente (antes quedaba el anterior).
  const key = `${url}|${anonKey}`;
  if (!activeClient || activeClientKey !== key) {
    try {
      activeClient = createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      });
      activeClientKey = key;
    } catch (err) {
      console.error('Error al inicializar cliente Supabase:', err);
      activeClient = null;
      return null;
    }
  }

  return activeClient;
}

/**
 * Cliente aparte, SIN sesión persistente, para registrar cuentas nuevas (auth.signUp) sin reemplazar la sesión del administrador
 * que está en pantalla: con el cliente normal, signUp dejaba iniciada la sesión de la cuenta recién creada.
 */
export function crearClienteSinSesion(): SupabaseClient | null {
  const { url, anonKey } = getStoredSupabaseConfig();
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

/**
 * Comprueba que el esquema de NOVA esté instalado consultando dim_droguerias (petición HEAD: sin cuerpo en la respuesta,
 * por eso se decide por el código HTTP y no por el mensaje, que llega vacío).
 */
export async function probarConexionSupabase(client: SupabaseClient | null = getSupabaseClient()): Promise<{ ok: boolean; mensaje: string }> {
  if (!client) return { ok: false, mensaje: 'Faltan la URL o la clave de Supabase.' };
  try {
    const { error, status } = await client.from('dim_droguerias').select('codigo', { count: 'exact', head: true });
    // v3 no da acceso al rol anónimo: sin sesión, 401/403 significa que URL, clave y esquema están bien.
    if (!error || status === 401 || status === 403 || error.code === '42501' || /permission denied/i.test(error.message ?? '')) {
      return { ok: true, mensaje: 'Conexión correcta. Ya puedes iniciar sesión con tu correo y contraseña.' };
    }
    if (status === 404 || error.code === '42P01' || error.code === 'PGRST205' || /relation|schema cache/i.test(error.message ?? '')) {
      return { ok: false, mensaje: 'Conectado a Supabase, pero NOVA no está instalado en este proyecto: ejecuta src/sql/nova_produccion_v3.sql en Supabase → SQL Editor.' };
    }
    if (status === 0 || /fetch|network|load failed/i.test(error.message ?? '')) {
      return { ok: false, mensaje: `Sin respuesta de Supabase (${error.message || 'error de red'}). Revisa tu internet o la URL.` };
    }
    return { ok: false, mensaje: `Supabase respondió con un error HTTP ${status}${error.message ? `: ${error.message}` : ''}${error.code ? ` (código ${error.code})` : ''}.` };
  } catch (err: unknown) {
    return { ok: false, mensaje: `Sin respuesta de Supabase: ${err instanceof Error ? err.message : String(err)}` };
  }
}
