import { describe, expect, it } from 'vitest';
import type { LocalCiclo, LocalFeriado } from '../offline/types';
import { cicloVigente, diaHabilCercano, diasHabiles, enRango, estadoCiclo, feriadosVenezuela, huecosCiclo, pascua, periodoActual, problemasCiclo, proponerPrimero, proponerSiguiente, siguienteNombre } from './logica';

const F: LocalFeriado[] = [
  { id: 'f1', fecha: '2027-01-01', nombre: 'Año Nuevo', alcance: 'nacional', estados: [] },
  { id: 'f2', fecha: '2027-01-15', nombre: 'Feria regional', alcance: 'regional', estados: ['Zulia'] },
  { id: 'f3', fecha: '2026-10-12', nombre: 'Día de la Resistencia Indígena', alcance: 'nacional', estados: [] },
];
const ciclo = (id: string, equipo_id: string | null, nombre: string, inicio: string, fin: string): LocalCiclo => ({ id, equipo_id, nombre, inicio, fin });

describe('días hábiles (igual que la base)', () => {
  it('lunes a viernes sin feriados nacionales; los regionales solo en su estado', () => {
    expect(diasHabiles('2027-01-01', '2027-01-31', F)).toBe(20);
    expect(diasHabiles('2027-01-01', '2027-01-31', F, ' zulia ')).toBe(19);
    expect(diasHabiles('2027-01-31', '2027-01-01', F)).toBe(0);
    expect(diaHabilCercano('2027-01-01', F)).toBe('2027-01-04'); // viernes feriado → lunes
    expect(diaHabilCercano('2027-01-03', F, -1)).toBe('2026-12-31');
  });

  it('Pascua y feriados nacionales de Venezuela', () => {
    expect(pascua(2026)).toBe('2026-04-05');
    expect(pascua(2027)).toBe('2027-03-28');
    const f = feriadosVenezuela(2026);
    expect(f).toHaveLength(14);
    expect(f.filter((x) => /Carnaval|Santo/.test(x.nombre)).map((x) => x.fecha)).toEqual(['2026-02-16', '2026-02-17', '2026-04-02', '2026-04-03']);
  });
});

describe('ciclos', () => {
  const C = [ciclo('a', 'etico', 'C8-2026', '2026-08-03', '2026-08-28'), ciclo('b', 'etico', 'C9-2026', '2026-08-31', '2026-09-25'), ciclo('g', null, 'General 9', '2026-09-01', '2026-09-30')];

  it('valida días hábiles y cruces dentro del mismo equipo', () => {
    expect(problemasCiclo({ equipo_id: 'etico', nombre: 'X', inicio: '2027-01-01', fin: '2027-01-30' }, C, F)).toEqual([
      'El ciclo debe empezar en un día hábil: el 01/01/2027 es feriado (Año Nuevo).',
      'El ciclo debe terminar en un día hábil: el 30/01/2027 es fin de semana.',
    ]);
    expect(problemasCiclo({ equipo_id: 'etico', nombre: 'X', inicio: '2026-08-24', fin: '2026-09-04' }, C, F)).toEqual(['Las fechas se cruzan con el ciclo C8-2026.']);
    expect(problemasCiclo({ equipo_id: 'otc', nombre: 'X', inicio: '2026-08-24', fin: '2026-09-04' }, C, F)).toEqual([]);
    expect(problemasCiclo({ id: 'a', equipo_id: 'etico', nombre: 'C8', inicio: '2026-08-03', fin: '2026-08-28' }, C, F)).toEqual([]);
  });

  it('el vigente es el del equipo y, si no tiene, el general', () => {
    expect(cicloVigente(C, 'etico', '2026-09-10')?.id).toBe('b');
    expect(cicloVigente(C, 'otc', '2026-09-10')?.id).toBe('g');
    expect(cicloVigente(C, 'otc', '2026-08-10')).toBeUndefined();
    expect(estadoCiclo(C[0], '2026-09-10')).toBe('terminado');
    expect(estadoCiclo({ ...C[0], cerrado_en: 'x' }, '2026-09-10')).toBe('cerrado');
    expect(estadoCiclo(C[1], '2026-08-30')).toBe('planificado');
  });

  it('propone el siguiente con la misma duración, en días hábiles, y el nombre que sigue', () => {
    expect(proponerSiguiente(C[1], F)).toEqual({ nombre: 'C10-2026', inicio: '2026-09-28', fin: '2026-10-23' });
    // Empieza tras un feriado: el 12/10 es lunes feriado → martes.
    expect(proponerSiguiente({ nombre: 'C11-2026', inicio: '2026-09-14', fin: '2026-10-09' }, F).inicio).toBe('2026-10-13');
    expect(siguienteNombre('C13-2026', '2027-01-04')).toBe('C1-2027');
    expect(siguienteNombre('Ciclo 4', '2026-01-01')).toBe('Ciclo 5');
    expect(siguienteNombre('Especial', '2026-01-01')).toBe('Especial (siguiente)');
    expect(proponerPrimero('2026-10-01', F)).toEqual({ nombre: 'C1-2026', inicio: '2026-10-05', fin: '2026-10-30' });
  });

  it('avisa los días hábiles que quedan sin ciclo entre dos ciclos del mismo equipo (el fin de semana no cuenta)', () => {
    expect(huecosCiclo(C[1], C, F)).toEqual([]);
    const h = huecosCiclo({ equipo_id: 'etico', inicio: '2026-10-05', fin: '2026-10-30' }, C, F);
    expect(h).toHaveLength(1);
    expect(h[0]).toContain('Quedan 5 días hábiles sin ciclo después de C9-2026');
    expect(huecosCiclo({ equipo_id: 'otc', inicio: '2026-10-05', fin: '2026-10-30' }, C, F)).toEqual([]);
  });

  it('período actual: ciclo del equipo (días hábiles transcurridos y restantes) o el mes', () => {
    const p = periodoActual(C, F, 'etico', '2026-09-14');
    expect(p).toMatchObject({ tipo: 'ciclo', desde: '2026-08-31', hasta: '2026-09-25', habiles: 20, transcurridos: 10, restantes: 10, del: 'del ciclo' });
    expect(p.anterior).toEqual({ desde: '2026-08-03', hasta: '2026-08-28', etiqueta: 'el ciclo C8-2026' });
    const m = periodoActual(C, F, 'otc', '2026-10-14');
    expect(m).toMatchObject({ tipo: 'mes', desde: '2026-10-01', hasta: '2026-10-31', habiles: 21, transcurridos: 8, restantes: 13, etiqueta: 'octubre' });
    expect(enRango(new Date(2026, 9, 31, 23, 30).toISOString(), m)).toBe(true);
    expect(enRango(new Date(2026, 10, 1, 0, 5).toISOString(), m)).toBe(false);
  });
});
