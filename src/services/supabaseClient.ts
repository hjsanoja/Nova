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
      .select('codigo', { count: 'exact', head: true });

    if (error) {
      if (error.message.includes('Invalid path')) {
        return {
          ok: false,
          mensaje: 'URL de Supabase inválida: pegaste la URL del navegador o una ruta errónea. Debe ser exactamente https://[id-de-tu-proyecto].supabase.co',
        };
      }
      if (error.message.includes('relation') || error.message.includes('schema cache') || error.code === '42P01') {
        return {
          ok: true,
          mensaje: 'Conectado a Supabase con éxito, pero la base de datos está vacía. Ve a la pestaña "Script SQL" en NOVA y sigue los pasos: ejecuta el esquema v3 (y la migración, si ya tenías datos) en el Supabase SQL Editor.',
        };
      }
      // El esquema v3 protege todas las tablas con RLS y no da acceso al rol anónimo: sin sesión, "permission denied"
      // significa que la URL y la clave son correctas y el esquema existe.
      if (error.code === '42501' || /permission denied/i.test(error.message)) {
        return {
          ok: true,
          mensaje: 'Conexión correcta. Las tablas están protegidas: inicia sesión con tu usuario (menú de cuenta) para ver y guardar datos.',
        };
      }
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
