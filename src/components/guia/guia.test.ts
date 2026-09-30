import { beforeEach, describe, expect, it } from 'vitest';
import { pasosDeLaGuia } from './GuiaBienvenida';
import { debeVerGuia, recordarGuiaVista } from './estadoGuia';

// Las pruebas corren en Node: un localStorage mínimo en memoria.
if (typeof globalThis.localStorage === 'undefined') {
  const datos = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, String(v)),
    removeItem: (k: string) => void datos.delete(k),
    clear: () => datos.clear(),
    key: (i: number) => [...datos.keys()][i] ?? null,
    get length() {
      return datos.size;
    },
  } as Storage;
}

describe('guía de bienvenida', () => {
  beforeEach(() => localStorage.clear());

  it('cada rol tiene su recorrido corto, con el flujo del pedido y un cierre', () => {
    for (const rol of ['vendedor', 'teletransferencista', 'gerente', 'admin'] as const) {
      const pasos = pasosDeLaGuia({ rol, nombre_completo: 'Ana Pérez' });
      expect(pasos.length).toBeGreaterThanOrEqual(4);
      expect(pasos.length).toBeLessThanOrEqual(7);
      expect(pasos[0].titulo).toBe('Te damos la bienvenida, Ana');
      expect(pasos.some((p) => p.flujo)).toBe(true);
      expect(pasos[pasos.length - 1].titulo).toBe('¡Listo!');
      // Frases cortas: nada de párrafos largos.
      for (const p of pasos) expect(p.texto.length).toBeLessThan(170);
    }
    expect(pasosDeLaGuia({ rol: 'vendedor', nombre_completo: 'Ana' }).map((p) => p.titulo)).toContain('Tomar un pedido');
    expect(pasosDeLaGuia({ rol: 'teletransferencista', nombre_completo: 'Ana' }).map((p) => p.titulo)).toContain('Descarga el archivo');
  });

  it('se ve una sola vez: lo decide la base y, si aún no lo registra, este equipo', () => {
    expect(debeVerGuia({ id: 'u1', guia_vista_en: null })).toBe(true);
    expect(debeVerGuia({ id: 'u1', guia_vista_en: '2026-09-30T10:00:00Z' })).toBe(false); // la vio en otro equipo
    recordarGuiaVista('u1');
    expect(debeVerGuia({ id: 'u1' })).toBe(false);
    expect(debeVerGuia({ id: 'u2' })).toBe(true); // otra persona en el mismo equipo
  });
});
