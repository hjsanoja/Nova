import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { iniciarSesionNube, restaurarSesionNube, traducirErrorAuth } from './sesion';

const perfil = (p: Record<string, unknown> | null) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: p, error: null }) }) }) });
function cliente(opts: { login?: { user?: object | null; error?: { message: string } | null }; perfil: Record<string, unknown> | null; sesion?: object | null }) {
  const llamadas: string[] = [];
  const sb = {
    auth: {
      signInWithPassword: async () => ({ data: { user: opts.login?.user === undefined ? { id: 'u1', email: 'a@b.com', created_at: '2026-01-01' } : opts.login.user }, error: opts.login?.error ?? null }),
      signOut: async () => void llamadas.push('signOut'),
      getSession: async () => ({ data: { session: opts.sesion ?? null }, error: null }),
    },
    from: () => perfil(opts.perfil),
  } as unknown as SupabaseClient;
  return { sb, llamadas };
}

describe('sesión', () => {
  it('traduce los errores de Supabase Auth', () => {
    expect(traducirErrorAuth('Invalid login credentials')).toBe('Correo o contraseña incorrectos.');
    expect(traducirErrorAuth('Email not confirmed')).toMatch(/Confirma tu correo/);
    expect(traducirErrorAuth('TypeError: Failed to fetch')).toMatch(/No hay conexión/);
  });

  it('entra con el rol de dim_usuarios', async () => {
    const { sb } = cliente({ perfil: { nombre_completo: 'Ana', rol: 'gerente', activo: true, telefono: null, dim_equipos: null } });
    expect(await iniciarSesionNube('a@b.com', 'x', sb)).toMatchObject({ id: 'u1', nombre_completo: 'Ana', rol: 'gerente', equipo: 'TODOS', activo: true });
  });

  it('una cuenta sin perfil o inactiva no entra y se cierra la sesión de Auth', async () => {
    const sin = cliente({ perfil: null });
    await expect(iniciarSesionNube('a@b.com', 'x', sin.sb)).rejects.toThrow(/aún no está activada/);
    expect(sin.llamadas).toEqual(['signOut']);
    const inactiva = cliente({ perfil: { nombre_completo: 'Ana', rol: 'vendedor', activo: false, dim_equipos: null } });
    await expect(iniciarSesionNube('a@b.com', 'x', inactiva.sb)).rejects.toThrow(/desactivada/);
  });

  it('credenciales incorrectas', async () => {
    const { sb } = cliente({ login: { user: null, error: { message: 'Invalid login credentials' } }, perfil: null });
    await expect(iniciarSesionNube('a@b.com', 'mala', sb)).rejects.toThrow('Correo o contraseña incorrectos.');
  });

  it('restaurar: con sesión vigente devuelve el usuario; sin sesión pide iniciar', async () => {
    const ok = cliente({ perfil: { nombre_completo: 'Ana', rol: 'vendedor', activo: true, dim_equipos: { codigo: 'A' } }, sesion: { user: { id: 'u1', email: 'a@b.com', created_at: '2026-01-01' } } });
    expect(await restaurarSesionNube(ok.sb)).toMatchObject({ estado: 'ok', usuario: { rol: 'vendedor', equipo: 'A' } });
    expect(await restaurarSesionNube(cliente({ perfil: null }).sb)).toEqual({ estado: 'sin_sesion' });
    expect(await restaurarSesionNube(null)).toEqual({ estado: 'sin_sesion' });
  });
});
