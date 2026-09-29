import { describe, expect, it } from 'vitest';
import { calcularRemanente, construirDerivado, puedeRerutear, resumenRemanente, siguienteCorrelativoDerivado } from './splitOrders';
import type { LocalDetalle, LocalPedido } from './types';

const det = (id: string, linea: number, sol: number, conf: number | null, extra: Partial<LocalDetalle> = {}): LocalDetalle => ({
  id, pedido_id: 'p1', linea, producto_id: `prod-${id}`, unidades_solicitadas: sol, unidades_confirmadas: conf,
  unidades_pendientes: Math.max(sol - (conf ?? 0), 0), motivo_ajuste: 'sin_quiebre', ...extra,
});

const padre = { id: 'p1', correlativo: 'PED-1045', estado: 'procesado_parcial', drogueria_id: 'A', cliente_id: 'c1', vendedor_id: 'v1', equipo_id: 'e1', pedido_raiz_id: 'p1', condicion_comercial_id: null, descuento_pedido_pct: null } as LocalPedido;

describe('split orders', () => {
  const detalles = [det('a', 1, 10, 10), det('b', 2, 8, 3), det('c', 3, 6, 0), det('d', 4, 4, 0, { remanente_derivado_en: 'x' })];

  it('el remanente son solo las líneas con pendientes aún no derivadas', () => {
    expect(calcularRemanente(detalles).map((l) => [l.detalle.id, l.unidades])).toEqual([['b', 5], ['c', 6]]);
    expect(resumenRemanente(detalles)).toEqual({ lineas: 2, unidades: 11 });
  });

  it('la numeración de derivados sigue la raíz: R1, R2…', () => {
    expect(siguienteCorrelativoDerivado({ correlativo: 'PED-1045' }, [{ sufijo_derivado: null }])).toEqual({ correlativo: 'PED-1045-R1', sufijo: 1 });
    expect(siguienteCorrelativoDerivado({ correlativo: 'PED-1045' }, [{ sufijo_derivado: null }, { sufijo_derivado: 1 }])).toEqual({ correlativo: 'PED-1045-R2', sufijo: 2 });
  });

  it('valida cuándo se puede re-rutear', () => {
    expect(puedeRerutear(padre, 'B', detalles)).toBeNull();
    expect(puedeRerutear(padre, 'A', detalles)).toMatch(/distinta/);
    expect(puedeRerutear({ ...padre, estado: 'facturado' }, 'B', detalles)).toMatch(/parcialmente/);
    expect(puedeRerutear(padre, 'B', [det('a', 1, 10, 10)])).toMatch(/remanente/);
  });

  it('construye PED-1045-R1 en revisión, con parent y solo lo pendiente, y marca el padre', () => {
    let n = 0;
    const r = construirDerivado({
      padre, raiz: padre, cadena: [padre], detallesPadre: detalles, drogueriaDestinoId: 'B', nuevoId: 'hijo',
      folioLocal: 'L-1', deviceId: 'D', ahora: '2026-09-30T00:00:00Z', nuevosIdsDetalle: () => `n${++n}`,
    });
    expect(r.pedido).toMatchObject({ correlativo: 'PED-1045-R1', estado: 'en_revision', parent_pedido_id: 'p1', pedido_raiz_id: 'p1', drogueria_id: 'B', sufijo_derivado: 1 });
    expect(r.detalles.map((d) => [d.producto_id, d.unidades_solicitadas, d.detalle_origen_id])).toEqual([['prod-b', 5, 'b'], ['prod-c', 6, 'c']]);
    expect(r.detallesPadreActualizados.filter((d) => d.remanente_derivado_en === 'hijo').map((d) => d.id)).toEqual(['b', 'c']);
    expect(r.detallesPadreActualizados.find((d) => d.id === 'd')!.remanente_derivado_en).toBe('x');
  });
});
