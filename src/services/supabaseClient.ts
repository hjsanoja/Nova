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
 * Inserta filas por lotes para no superar el límite de tamaño de petición de PostgREST
 * ni bloquear la pestaña con un único payload de decenas de miles de filas.
 */
export async function insertarPorLotes(
  client: SupabaseClient,
  tabla: string,
  filas: Record<string, unknown>[],
  tamanoLote = 500
): Promise<{ insertadas: number; error?: string }> {
  let insertadas = 0;
  for (let i = 0; i < filas.length; i += tamanoLote) {
    const lote = filas.slice(i, i + tamanoLote);
    const { error } = await client.from(tabla).insert(lote);
    if (error) return { insertadas, error: error.message };
    insertadas += lote.length;
  }
  return { insertadas };
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
