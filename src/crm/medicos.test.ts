import { describe, expect, it } from 'vitest';
import type { LocalMedico, LocalVisita } from '../offline/types';
import { coberturaMedicos, columnasMedicos, leerMedicos, resumenCobertura } from './medicos';

describe('médicos: archivo de carga', () => {
  it('reconoce los títulos habituales', () => {
    expect(columnasMedicos(['Código', 'Nombre del médico', 'Especialidad', 'Clínica', 'Teléfono', 'Email', 'Categoría', 'Visitas/mes', 'Latitud', 'Longitud', 'Correo del representante'])).toEqual({
      codigo: 0, nombre: 1, especialidad: 2, centro: 3, telefono: 4, correo: 5, categoria: 6, visitas_mes: 7, lat: 8, lon: 9, representante: 10,
    });
  });

  it('lee las filas, limpia valores y descarta las que no tienen nombre', () => {
    const r = leerMedicos([
      ['Cartera de médicos'],
      ['CODIGO', 'NOMBRE', 'CATEGORIA', 'VISITAS_MES', 'LATITUD', 'REPRESENTANTE'],
      ['MED-1', 'Ana Pérez', 'a', '2', '10,49', 'ana@x.com'],
      ['MED-2', '', 'B', '1', '', ''],
      ['', '', '', '', '', ''],
      ['MED-3', 'Luis Mora', 'Z', 'dos', '', ''],
    ]);
    expect(r.filas).toEqual([
      { linea: 3, codigo: 'MED-1', nombre: 'Ana Pérez', categoria: 'A', visitas_mes: '2', lat: '10.49', representante: 'ana@x.com' },
      { linea: 6, codigo: 'MED-3', nombre: 'Luis Mora' },
    ]);
    expect(r.descartes).toEqual([{ linea: 4, motivo: 'Falta el nombre del médico' }]);
    expect(leerMedicos([['A', 'B']]).descartes[0].motivo).toMatch(/NOMBRE/);
  });
});

describe('médicos: cobertura del mes', () => {
  const m = (id: string, extra: Partial<LocalMedico> = {}) => ({ id, nombre: id, activo: true, ...extra }) as LocalMedico;
  const v = (medico_id: string, fecha: string, resultado: LocalVisita['resultado'] = 'realizada') => ({ id: `${medico_id}${fecha}`, medico_id, cliente_id: null, vendedor_id: 'v', checkin_en: fecha, resultado, sync_estado: 'sincronizado' }) as LocalVisita;
  it('cuenta solo visitas realizadas del mes y ordena lo pendiente primero (A antes que B)', () => {
    const hoy = new Date(2026, 9, 20);
    const c = coberturaMedicos(
      [m('b', { categoria: 'B', visitas_mes: 1 }), m('a', { categoria: 'A', visitas_mes: 2 }), m('c', { categoria: 'A' }), m('x', { activo: false })],
      [v('a', new Date(2026, 9, 3).toISOString()), v('a', new Date(2026, 9, 5).toISOString(), 'no_atendio'), v('c', new Date(2026, 9, 2).toISOString()), v('b', new Date(2026, 8, 28).toISOString())],
      hoy
    );
    expect(c.map((x) => [x.medico.id, x.hechas, x.esperadas])).toEqual([['a', 1, 2], ['b', 0, 1], ['c', 1, 1]]);
    expect(resumenCobertura(c)).toEqual({ cubiertos: 1, total: 3, visitas: 2, esperadas: 4, esperadasBase: 4 });
  });
  it('ajustada por días libres aprobados: lo esperado baja en proporción a los días efectivos', () => {
    const c = coberturaMedicos([m('a', { visitas_mes: 4 }), m('b', { visitas_mes: 1 })], [], { desde: '2027-01-04', hasta: '2027-01-29' }, () => 15 / 20);
    expect(c.map((x) => [x.medico.id, x.esperadas, x.esperadasBase])).toEqual([['a', 3, 4], ['b', 1, 1]]);
    expect(resumenCobertura(c)).toMatchObject({ esperadas: 4, esperadasBase: 5 });
    expect(coberturaMedicos([m('a', { visitas_mes: 4 })], [], new Date(), () => 0)[0]).toMatchObject({ esperadas: 0, hechas: 0 });
  });

  it('por ciclo: cuenta las visitas dentro de las fechas del ciclo (o del ciclo del equipo de cada representante)', () => {
    const medicos = [m('a', { visitas_mes: 2, vendedor_id: 'v1' }), m('b', { vendedor_id: 'v2' })];
    const visitas = [v('a', new Date(2026, 8, 30, 10).toISOString()), v('a', new Date(2026, 9, 1, 10).toISOString()), v('b', new Date(2026, 9, 2, 10).toISOString())];
    const ciclo = coberturaMedicos(medicos, visitas, { desde: '2026-09-28', hasta: '2026-10-23' });
    expect(ciclo.map((x) => [x.medico.id, x.hechas])).toEqual([['a', 2], ['b', 1]]);
    const porEquipo = coberturaMedicos(medicos, visitas, (x) => (x.vendedor_id === 'v1' ? { desde: '2026-10-01', hasta: '2026-10-28' } : { desde: '2026-09-01', hasta: '2026-09-30' }));
    expect(porEquipo.map((x) => [x.medico.id, x.hechas])).toEqual([['a', 1], ['b', 0]]);
  });
});

describe('reporte de visitas', () => {
  it('por representante y muestras por producto', async () => {
    const { visitasPorRepresentante, muestrasPorProducto } = await import('./medicos');
    const base = { sync_estado: 'sincronizado' as const };
    const vs = [
      { ...base, id: '1', vendedor_id: 'a', cliente_id: 'c', checkin_en: '2026-10-02T10:00:00Z', resultado: 'pedido_tomado' as const, dentro_de_radio: true },
      { ...base, id: '2', vendedor_id: 'a', cliente_id: null, medico_id: 'm', checkin_en: '2026-10-03T10:00:00Z', resultado: 'realizada' as const, muestras: [{ producto_id: 'p', cantidad: 3 }, { producto_id: 'q', cantidad: 1 }] },
      { ...base, id: '3', vendedor_id: 'b', cliente_id: null, medico_id: 'm', checkin_en: '2026-10-04T10:00:00Z', resultado: 'realizada' as const, muestras: [{ producto_id: 'p', cantidad: 2 }] },
      { ...base, id: '4', vendedor_id: 'b', cliente_id: 'c', checkin_en: '2026-09-01T10:00:00Z', resultado: 'sin_pedido' as const },
    ];
    const desde = new Date('2026-10-01T00:00:00Z');
    expect(visitasPorRepresentante(vs, desde)).toEqual([
      { vendedor_id: 'a', farmacias: 1, medicos: 1, enElLugar: 1, pedidos: 1, muestras: 4 },
      { vendedor_id: 'b', farmacias: 0, medicos: 1, enElLugar: 0, pedidos: 0, muestras: 2 },
    ]);
    expect(muestrasPorProducto(vs, desde)).toEqual([{ producto_id: 'p', cantidad: 5 }, { producto_id: 'q', cantidad: 1 }]);
  });
});
