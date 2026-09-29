import { describe, expect, it } from 'vitest';
import { bonificaciones, condicionesDisponibles, describirFaltantes, evaluarPedido, reglaAplica, topeDescuentoLinea } from './politicas';
import type { ContextoPedido } from './politicas';
import { REGLA_BASE, REGLA_MIX } from './testing/utiles';

const linea = (id: string, unidades: number, descuento?: number, categoria = 'cardio') => ({ producto_id: id, sku: `SKU-${id}`, categoria, unidades, descuento_pct: descuento });
const ctx = (lineas: ContextoPedido['lineas'], extra: Partial<ContextoPedido> = {}): ContextoPedido => ({ cliente_validado: true, lineas, hoy: '2026-09-30', ...extra });

describe('políticas comerciales (mismas reglas que el servidor)', () => {
  it('con 3 SKUs distintos el descuento sube al tope de la regla Mix (12 %)', () => {
    const c = ctx([linea('1', 10, 10), linea('2', 8), linea('3', 6)]);
    expect(topeDescuentoLinea([REGLA_BASE, REGLA_MIX], c, c.lineas[0])).toBe(12);
    expect(evaluarPedido([REGLA_BASE, REGLA_MIX], c).requiere_revision_especial).toBe(false);
  });

  it('un solo SKU con 10 % excede el tope base (5 %) y queda para Revisión Especial', () => {
    const e = evaluarPedido([REGLA_BASE, REGLA_MIX], ctx([linea('1', 4, 10)]));
    expect(e.requiere_revision_especial).toBe(true);
    expect(e.violaciones[0]).toMatchObject({ tipo: 'descuento_linea_excedido', descuento: 10, maximo: 5 });
  });

  it('sin ninguna regla aplicable rige el descuento base configurado (0 por defecto)', () => {
    expect(evaluarPedido([], ctx([linea('1', 4, 1)])).violaciones).toHaveLength(1);
    expect(evaluarPedido([], ctx([linea('1', 4, 1)], { descuento_base: 3 })).violaciones).toHaveLength(0);
  });

  it('un cliente sin validar retiene el pedido pero no cuenta como revisión especial', () => {
    const e = evaluarPedido([REGLA_BASE], ctx([linea('1', 4)], { cliente_validado: false }));
    expect(e.cliente_no_validado).toBe(true);
    expect(e.requiere_revision_especial).toBe(false);
    expect(e.motivos.map((m) => m.tipo)).toEqual(['cliente_no_validado']);
  });

  it('respeta vigencia, equipo, droguería y segmento', () => {
    const vip = { ...REGLA_MIX, id: 'vip', segmento_cliente: 'vip' as const, descuento_max_pct: 20, min_skus_distintos: null };
    const c = ctx([linea('1', 5, 15)]);
    expect(reglaAplica(vip, c)).toBe(false);
    expect(reglaAplica(vip, { ...c, segmento: 'vip' })).toBe(true);
    expect(reglaAplica({ ...vip, vigente_hasta: '2026-01-01' }, { ...c, segmento: 'vip' })).toBe(false);
    expect(reglaAplica({ ...vip, equipo_id: 'otro' }, { ...c, segmento: 'vip', equipo_id: 'eq' })).toBe(false);
    expect(reglaAplica({ ...vip, activo: false }, { ...c, segmento: 'vip' })).toBe(false);
  });

  it('umbrales de unidades totales y por categoría', () => {
    const r = { ...REGLA_BASE, id: 'cat', descuento_max_pct: 15, min_unidades_totales: 30, min_unidades_categoria: 20, categoria_objetivo: 'cardio' };
    expect(reglaAplica(r, ctx([linea('1', 10), linea('2', 10)]))).toBe(false);
    expect(reglaAplica(r, ctx([linea('1', 25), linea('2', 10, 0, 'gastro')]))).toBe(true);
    // solo aplica a las líneas de la categoría objetivo
    const c = ctx([linea('1', 25, 10), linea('2', 10, 10, 'gastro')]);
    expect(topeDescuentoLinea([REGLA_BASE, r], c, c.lineas[0])).toBe(15);
    expect(topeDescuentoLinea([REGLA_BASE, r], c, c.lineas[1])).toBe(5);
  });

  it('lista las condiciones con lo que falta para activarlas (selector de la pantalla)', () => {
    const lista = condicionesDisponibles([REGLA_BASE, REGLA_MIX], ctx([linea('1', 10)]));
    expect(lista[0].regla.id).toBe('r-base');
    expect(lista[0].aplica).toBe(true);
    expect(lista[1].aplica).toBe(false);
    expect(describirFaltantes(lista[1].faltantes)).toBe('Faltan 2 SKUs más');
    expect(describirFaltantes(lista[0].faltantes)).toBe('Cumple');
  });

  it('calcula bonificaciones (1 gratis por cada 10)', () => {
    const r = { ...REGLA_BASE, id: 'bono', bonificacion: { por_cada: 10, gratis: 1 } };
    expect(bonificaciones([r], ctx([linea('1', 35), linea('2', 9)]))).toEqual([{ regla_id: 'bono', producto_id: '1', gratis: 3 }]);
  });
});
