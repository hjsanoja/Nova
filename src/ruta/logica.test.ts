import { describe, expect, it } from 'vitest';
import { distanciaTexto, leToca, ordenarRuta } from './logica';
import type { ClienteConActividad } from '../vistas/logica';
import type { LocalCliente } from '../offline/types';

const act = (id: string, lat: number | null, lon: number | null, dias: number | null, frecuencia = 7): ClienteConActividad => ({
  cliente: { id, nombre_comercial: id, lat, lon, frecuencia_dias: frecuencia } as LocalCliente,
  ultimaActividad: null,
  dias,
  atraso: dias == null ? null : dias - frecuencia,
});

describe('ruta del día', () => {
  it('le toca a quien nunca compró o ya cumplió su frecuencia', () => {
    expect([act('a', 0, 0, null), act('b', 0, 0, 10), act('c', 0, 0, 6), act('d', 0, 0, 2)].filter((a) => leToca(a)).map((a) => a.cliente.id)).toEqual(['a', 'b', 'c']);
  });

  it('ordena por cercanía desde el vendedor y deja al final las farmacias sin ubicación', () => {
    const lista = [act('lejos', 10.6, -66.9, 20), act('cerca', 10.501, -66.85, 8), act('medio', 10.55, -66.87, 9), act('sin', null, null, 30)];
    const r = ordenarRuta(lista, { lat: 10.5, lon: -66.85 }, new Set(['medio']));
    expect(r.map((p) => p.actividad.cliente.id)).toEqual(['cerca', 'medio', 'lejos', 'sin']);
    expect(r[0].tramo).toBeLessThan(200);
    expect(r[1].visitadaHoy).toBe(true);
    expect(r[3].tramo).toBeNull();
    // Sin GPS empieza por la más atrasada.
    expect(ordenarRuta(lista, null, new Set())[0].actividad.cliente.id).toBe('lejos');
  });

  it('distancias legibles', () => {
    expect(distanciaTexto(843)).toBe('840 m');
    expect(distanciaTexto(2400)).toBe('2,4 km');
  });
});
