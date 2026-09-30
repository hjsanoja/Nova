import { describe, expect, it } from 'vitest';
import { diagnosticarConexion, refDeUrl, revisarClave } from './diagnosticoConexion';

const jwt = (p: object) => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify(p)).replace(/=+$/, '')}.firma`;
const URL_OK = 'https://abcdefghijklmnop.supabase.co';
const ANON = jwt({ iss: 'supabase', ref: 'abcdefghijklmnop', role: 'anon' });
const responde = (status: number) => (async () => new Response('{}', { status })) as unknown as typeof fetch;

describe('diagnóstico de la conexión con Supabase', () => {
  it('extrae el proyecto de la URL', () => {
    expect(refDeUrl(URL_OK)).toBe('abcdefghijklmnop');
    expect(refDeUrl('https://api.midominio.com')).toBeNull();
  });

  it('rechaza claves secretas, de otro proyecto o mal copiadas', () => {
    expect(revisarClave(URL_OK, 'sb_secret_xyz')).toMatch(/SECRETA/);
    expect(revisarClave(URL_OK, jwt({ ref: 'abcdefghijklmnop', role: 'service_role' }))).toMatch(/service_role/);
    expect(revisarClave(URL_OK, jwt({ ref: 'otroproyecto1234', role: 'anon' }))).toMatch(/otro proyecto \(otroproyecto1234\)/);
    expect(revisarClave(URL_OK, 'eyJhbGciOiJIUzI1NiJ9.recortada')).toMatch(/formato/);
    expect(revisarClave(URL_OK, ANON)).toBeNull();
    expect(revisarClave(URL_OK, 'sb_publishable_abc123')).toBeNull();
  });

  it('distingue servidor inalcanzable, clave rechazada y conexión correcta', async () => {
    const sinRed = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    expect((await diagnosticarConexion(URL_OK, ANON, sinRed)).mensaje).toMatch(/No se pudo llegar a https:\/\/abcdefghijklmnop\.supabase\.co/);
    expect((await diagnosticarConexion(URL_OK, ANON, responde(401))).mensaje).toMatch(/rechazó la clave/);
    expect((await diagnosticarConexion(URL_OK, ANON, responde(404))).mensaje).toMatch(/no hay un proyecto/);
    expect(await diagnosticarConexion(URL_OK, ANON, responde(200))).toEqual({ ok: true, mensaje: 'La URL y la clave son correctas.' });
  });

  it('limpia la URL pegada desde el panel antes de probar', async () => {
    let pedido = '';
    const espia = (async (u: string) => { pedido = u; return new Response('{}', { status: 200 }); }) as unknown as typeof fetch;
    await diagnosticarConexion(' https://supabase.com/dashboard/project/abcdefghijklmnop/settings ', ANON, espia);
    expect(pedido).toBe(`${URL_OK}/auth/v1/settings`);
  });

  it('acepta la cadena de conexión de PostgreSQL pegada por error y rechaza lo que no es una URL', async () => {
    let pedido = '';
    const espia = (async (u: string) => { pedido = u; return new Response('{}', { status: 200 }); }) as unknown as typeof fetch;
    expect((await diagnosticarConexion('postgresql://postgres:clave@db.abcdefghijklmnop.supabase.co:5432/postgres', ANON, espia)).ok).toBe(true);
    expect(pedido).toBe(`${URL_OK}/auth/v1/settings`);
    expect((await diagnosticarConexion('postgresql://postgres.abcdefghijklmnop:clave@aws-0-us-east-1.pooler.supabase.com:6543/postgres', ANON, espia)).ok).toBe(true);
    expect(pedido).toBe(`${URL_OK}/auth/v1/settings`);
    const r = await diagnosticarConexion('mi proyecto nova', ANON, responde(200));
    expect(r).toMatchObject({ ok: false, mensaje: expect.stringMatching(/no es válida/) });
  });
});
