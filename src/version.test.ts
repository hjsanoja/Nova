import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CREDITOS, NOVEDADES, VERSION, compararVersiones, esSiguienteVersion, textoCreditos } from './version';

describe('versión de NOVA', () => {
  it('la primera novedad es la versión que corre y package.json dice lo mismo', () => {
    expect(VERSION).toBe(NOVEDADES[0].version);
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(pkg.version).toBe(`${VERSION}.0`);
  });

  it('cada versión sigue a la anterior: +0.1 si es chica, siguiente entero si es grande', () => {
    const ordenadas = [...NOVEDADES].reverse();
    expect(ordenadas[0].version).toBe('1.0');
    for (let i = 1; i < ordenadas.length; i++) {
      const { version, tipo } = ordenadas[i];
      expect(esSiguienteVersion(ordenadas[i - 1].version, version, tipo), `${ordenadas[i - 1].version} → ${version} (${tipo})`).toBe(true);
    }
  });

  it('cada versión dice qué cambió y cuándo', () => {
    for (const n of NOVEDADES) {
      expect(n.titulo.length).toBeGreaterThan(3);
      expect(n.cambios.length).toBeGreaterThan(0);
      expect(n.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('compara versiones como números (6.10 es más nueva que 6.9)', () => {
    expect(compararVersiones('7.0', '6.2')).toBeGreaterThan(0);
    expect(compararVersiones('6.10', '6.9')).toBeGreaterThan(0);
    expect(compararVersiones('6.2', '6.2')).toBe(0);
    expect(esSiguienteVersion('6.9', '6.10', 'menor')).toBe(true);
    expect(esSiguienteVersion('6.2', '6.4', 'menor')).toBe(false);
    expect(esSiguienteVersion('6.2', '7.1', 'mayor')).toBe(false);
  });

  it('muestra a quienes hacen NOVA', () => {
    expect(CREDITOS.map((c) => c.nombre)).toEqual(['Hernando Sanoja', 'Dubralis Fajardo']);
    expect(textoCreditos()).toBe('Hernando Sanoja (Responsable) · Dubralis Fajardo (Responsable)');
  });
});
