import { describe, expect, it } from 'vitest';
import type { LocalActividad, LocalFeriado, LocalMotivo } from '../offline/types';
import { diasEfectivos, problemasActividad, textoFechas } from './logica';

const F: LocalFeriado[] = [
  { id: 'f1', fecha: '2027-01-01', nombre: 'Año Nuevo', alcance: 'nacional', estados: [] },
  { id: 'f2', fecha: '2027-01-15', nombre: 'Feria regional', alcance: 'regional', estados: ['Zulia'] },
];
const M: LocalMotivo[] = [
  { id: 'vac', nombre: 'Vacaciones', descuenta: true, requiere_aprobacion: true, activo: true, orden: 1 },
  { id: 'cap', nombre: 'Capacitación', descuenta: false, requiere_aprobacion: true, activo: true, orden: 2 },
  { id: 'old', nombre: 'Viejo', descuenta: true, requiere_aprobacion: true, activo: false, orden: 3 },
];
const act = (id: string, extra: Partial<LocalActividad>): LocalActividad => ({ id, vendedor_id: 'v1', motivo_id: 'vac', desde: '2027-01-11', hasta: '2027-01-15', jornada: 'completa', estado: 'aprobada', sync_estado: 'sincronizado', ...extra });

describe('actividades', () => {
  it('valida como la base: fechas, media jornada, cruces y motivos', () => {
    const otras = [act('a', {})];
    expect(problemasActividad({ id: 'n', motivo_id: 'vac', desde: '2027-01-14', hasta: '2027-01-18', jornada: 'completa' }, otras, M)).toEqual(['Ya reportaste Vacaciones del 11/01 al 15/01.']);
    expect(problemasActividad({ id: 'n', motivo_id: 'vac', desde: '2027-01-20', hasta: '2027-01-21', jornada: 'media' }, otras, M)).toEqual(['La media jornada es de un solo día.']);
    expect(problemasActividad({ id: 'n', motivo_id: 'old', desde: '2027-01-20', hasta: '2027-01-19', jornada: 'completa' }, otras, M)).toEqual(['Ese motivo ya no está disponible.', 'Revisa las fechas: el fin no puede ser antes del inicio.']);
    expect(problemasActividad({ id: 'a', motivo_id: 'vac', desde: '2027-01-11', hasta: '2027-01-12', jornada: 'completa' }, otras, M)).toEqual([]);
    expect(problemasActividad({ id: 'n', motivo_id: 'vac', desde: '2027-01-14', hasta: '2027-01-14', jornada: 'completa' }, [act('a', { estado: 'rechazada' })], M)).toEqual([]);
    expect(textoFechas({ desde: '2027-01-20', hasta: '2027-01-20', jornada: 'media' })).toBe('el 20/01 (media jornada)');
  });

  it('días efectivos: lo aprobado que descuenta, sin fines de semana ni feriados (también los regionales)', () => {
    const lista = [
      act('vac', {}),
      act('media', { desde: '2027-01-20', hasta: '2027-01-20', jornada: 'media' }),
      act('cap', { motivo_id: 'cap', desde: '2027-01-21', hasta: '2027-01-21' }),
      act('pend', { desde: '2027-01-25', hasta: '2027-01-26', estado: 'pendiente' }),
      act('otro', { vendedor_id: 'v2', desde: '2027-01-04', hasta: '2027-01-08' }),
    ];
    const enero = { desde: '2027-01-01', hasta: '2027-01-31' };
    expect(diasEfectivos(lista, M, 'v1', enero, F, 'Zulia')).toEqual({ habiles: 19, libres: 4.5, efectivos: 14.5 });
    expect(diasEfectivos(lista, M, 'v1', enero, F)).toEqual({ habiles: 20, libres: 5.5, efectivos: 14.5 });
    expect(diasEfectivos(lista, M, 'v1', { desde: '2027-01-13', hasta: '2027-01-19' }, F, 'Zulia').libres).toBe(2);
  });
});
