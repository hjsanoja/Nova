import { describe, expect, it } from 'vitest';
import { aplicarConfirmacionLocal, estadoTrasConfirmar, validarConfirmaciones } from './mesa';
import type { LocalDetalle } from '../offline/types';

const det = (id: string, sol: number, conf: number | null = null): LocalDetalle => ({
  id, pedido_id: 'p', linea: 1, producto_id: id, unidades_solicitadas: sol, unidades_confirmadas: conf, unidades_pendientes: sol - (conf ?? 0), motivo_ajuste: 'sin_quiebre',
});

describe('mesa de transferencias', () => {
  const lineas = [det('a', 10), det('b', 8), det('c', 6)];
  it('el estado resultante coincide con la regla del servidor', () => {
    expect(estadoTrasConfirmar(lineas, [{ detalle_id: 'a', unidades_confirmadas: 10 }, { detalle_id: 'b', unidades_confirmadas: 8 }, { detalle_id: 'c', unidades_confirmadas: 6 }])).toBe('procesado_total');
    expect(estadoTrasConfirmar(lineas, [{ detalle_id: 'a', unidades_confirmadas: 10 }, { detalle_id: 'b', unidades_confirmadas: 3 }, { detalle_id: 'c', unidades_confirmadas: 0 }])).toBe('procesado_parcial');
    expect(estadoTrasConfirmar(lineas, lineas.map((l) => ({ detalle_id: l.id, unidades_confirmadas: 0 })))).toBe('rechazado');
  });
  it('valida enteros, no negativos y no más de lo pedido', () => {
    expect(validarConfirmaciones(lineas, [{ detalle_id: 'a', unidades_confirmadas: 10 }])).toBeNull();
    expect(validarConfirmaciones(lineas, [{ detalle_id: 'a', unidades_confirmadas: 11 }])).toMatch(/más de lo pedido/);
    expect(validarConfirmaciones(lineas, [{ detalle_id: 'a', unidades_confirmadas: -1 }])).toMatch(/enteros/);
    expect(validarConfirmaciones(lineas, [{ detalle_id: 'a', unidades_confirmadas: 1.5 }])).toMatch(/enteros/);
    expect(validarConfirmaciones(lineas, [{ detalle_id: 'zz', unidades_confirmadas: 1 }])).toMatch(/ya no pertenece/);
  });
  it('en local calcula pendientes y motivo por línea', () => {
    const r = aplicarConfirmacionLocal(lineas, [{ detalle_id: 'a', unidades_confirmadas: 10 }, { detalle_id: 'b', unidades_confirmadas: 3, motivo: 'limite_credito' }, { detalle_id: 'c', unidades_confirmadas: 0 }]);
    expect(r.map((d) => [d.unidades_confirmadas, d.unidades_pendientes, d.motivo_ajuste])).toEqual([[10, 0, 'sin_quiebre'], [3, 5, 'limite_credito'], [0, 6, 'quiebre_stock_drogueria']]);
  });
});
