import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { probarConexionSupabase } from './supabaseClient';

/** Cliente falso: la consulta HEAD devuelve lo que PostgREST devuelve de verdad (sin cuerpo: mensaje vacío). */
const cliente = (status: number, error: { message: string; code?: string } | null) =>
  ({ from: () => ({ select: async () => ({ status, error }) }) }) as unknown as SupabaseClient;

describe('prueba de conexión con Supabase', () => {
  it('401 sin cuerpo (tablas protegidas para anon) es una conexión correcta', async () => {
    expect(await probarConexionSupabase(cliente(401, { message: '' }))).toMatchObject({ ok: true });
    expect(await probarConexionSupabase(cliente(200, null))).toMatchObject({ ok: true });
  });

  it('404 indica que falta instalar NOVA', async () => {
    expect((await probarConexionSupabase(cliente(404, { message: '' }))).mensaje).toMatch(/nova_produccion_v3\.sql/);
  });

  it('sin red o con otro error, el mensaje nunca queda vacío', async () => {
    expect((await probarConexionSupabase(cliente(0, { message: 'TypeError: Failed to fetch' }))).mensaje).toMatch(/Sin respuesta/);
    expect((await probarConexionSupabase(cliente(500, { message: '' }))).mensaje).toBe('Supabase respondió con un error HTTP 500.');
  });
});
