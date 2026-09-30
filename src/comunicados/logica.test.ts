import { describe, expect, it } from 'vitest';
import { describirDestino, paraMostrar, vigencia } from './logica';
import type { LocalComunicado } from '../offline/types';

const c = (id: string, extra: Partial<LocalComunicado> = {}): LocalComunicado => ({
  id, titulo: id, mensaje: '', tipo: 'anuncio', roles: [], equipos: [], estados: [], ciudades: [], regiones: [],
  vigente_desde: '2026-09-01T00:00:00Z', vigente_hasta: null, para_mi: true, creado_por: null, created_at: '', updated_at: '', ...extra,
});
const AHORA = new Date('2026-09-30T12:00:00Z');

describe('comunicados', () => {
  it('vigencia: programado, activo y vencido', () => {
    expect(vigencia(c('a', { vigente_desde: '2026-10-01T00:00:00Z' }), AHORA)).toBe('programado');
    expect(vigencia(c('b'), AHORA)).toBe('activo');
    expect(vigencia(c('c', { vigente_hasta: '2026-09-29T00:00:00Z' }), AHORA)).toBe('vencido');
  });

  it('solo se muestran los vigentes dirigidos a la persona, los más nuevos primero', () => {
    const lista = [c('viejo'), c('nuevo', { vigente_desde: '2026-09-20T00:00:00Z' }), c('ajeno', { para_mi: false }), c('vencido', { vigente_hasta: '2026-09-02T00:00:00Z' })];
    expect(paraMostrar(lista, AHORA).map((x) => x.id)).toEqual(['nuevo', 'viejo']);
  });

  it('describe a quién va dirigido', () => {
    expect(describirDestino(c('x'))).toBe('Todos');
    expect(describirDestino(c('x', { roles: ['vendedor'], equipos: ['e1'], estados: ['Zulia', 'Lara'], regiones: ['Occidente'] }), () => 'Ético')).toBe('Vendedores · Ético · Región Occidente · Zulia, Lara');
  });
});
