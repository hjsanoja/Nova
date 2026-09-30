import { describe, expect, it } from 'vitest';
import { bonificaciones, descuentosPorProducto, ofertaDeProducto, condicionDelPedido, condicionesDisponibles, describirFaltantes, describirRequisitos, evaluarPedido, reglaAplica, topeDescuentoLinea } from './politicas';
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

describe('condición del pedido (descuento automático)', () => {
  const base = { alcance: 'pedido' as const, vigente_desde: '2026-01-01', prioridad: 100, activo: true };
  const reglas = [
    { ...base, id: 'a', nombre: '5% por 3 SKU', descuento_max_pct: 5, min_skus_distintos: 3 },
    { ...base, id: 'b', nombre: '8% por 100 uds', descuento_max_pct: 8, min_unidades_totales: 100 },
    { ...base, id: 'c', nombre: '12% por 5 SKU y 200 uds', descuento_max_pct: 12, min_skus_distintos: 5, min_unidades_totales: 200 },
    { ...base, id: 'l', nombre: 'de línea', alcance: 'linea' as const, descuento_max_pct: 50 },
  ];
  const ctx = (skus: number, uds: number) => ({ cliente_validado: true, hoy: '2026-06-01', lineas: Array.from({ length: skus }, (_, i) => ({ producto_id: `p${i}`, unidades: Math.floor(uds / skus) })) });

  it('aplica la de mayor descuento que se cumple y sugiere la siguiente más cercana', () => {
    expect(condicionDelPedido(reglas, ctx(1, 10))).toMatchObject({ aplicada: null, siguiente: { regla: { id: 'a' }, faltantes: { skus: 2 } } });
    expect(condicionDelPedido(reglas, ctx(3, 30))).toMatchObject({ aplicada: { pct: 5 }, siguiente: { regla: { id: 'b' }, faltantes: { unidades: 70 } } });
    expect(condicionDelPedido(reglas, ctx(4, 120))).toMatchObject({ aplicada: { pct: 8 }, siguiente: { regla: { id: 'c' } } });
    expect(condicionDelPedido(reglas, ctx(5, 200))).toMatchObject({ aplicada: { pct: 12 }, siguiente: null });
  });

  it('respeta vigencia, estado y droguería', () => {
    const r = [{ ...reglas[0], vigente_hasta: '2026-03-01' }, { ...reglas[1], activo: false }, { ...reglas[2], drogueria_id: 'd1' }];
    expect(condicionDelPedido(r, { ...ctx(5, 200), drogueria_id: 'd2' }).aplicada).toBeNull();
    expect(condicionDelPedido(r, { ...ctx(5, 200), drogueria_id: 'd1' }).aplicada?.pct).toBe(12);
  });

  it('describe los requisitos', () => {
    expect(describirRequisitos({ min_skus_distintos: 3, min_unidades_totales: null })).toBe('Desde 3 productos distintos');
    expect(describirRequisitos({ min_skus_distintos: 5, min_unidades_totales: 200 })).toBe('Desde 5 productos distintos y 200 unidades');
    expect(describirRequisitos({ min_skus_distintos: null, min_unidades_totales: null })).toBe('Sin mínimo');
  });
});

describe('descuentos por producto', () => {
  const regla = (id: string, pct: number, productos: string[], extra = {}) =>
    ({ id, nombre: id, alcance: 'linea' as const, descuento_max_pct: pct, productos, vigente_desde: '2026-01-01', prioridad: 100, activo: true, ...extra });
  const R = [regla('los', 10, ['1']), regla('los-vol', 15, ['1'], { min_unidades_producto: 20 }), regla('ome', 8, ['3'], { vigente_hasta: '2026-09-01' })];

  it('se aplica el mayor que alcanza al producto y a sus unidades', () => {
    expect([...descuentosPorProducto(R, ctx([linea('1', 5), linea('2', 50)])).entries()].map(([k, v]) => [k, v.pct])).toEqual([['1', 10]]);
    expect(descuentosPorProducto(R, ctx([linea('1', 20)])).get('1')?.pct).toBe(15);
    expect(descuentosPorProducto(R, ctx([linea('3', 99)])).size).toBe(0); // vencido
  });

  it('la oferta del catálogo y el tope que valida el servidor son coherentes', () => {
    expect(ofertaDeProducto(R, '1', { hoy: '2026-09-30' })).toEqual({ pct: 15, desde: 20 });
    expect(ofertaDeProducto(R, '2', { hoy: '2026-09-30' })).toBeNull();
    const c = ctx([linea('1', 20, 15), linea('2', 5, 15)]);
    const e = evaluarPedido(R, c);
    expect(e.violaciones.map((v) => ('producto_id' in v ? v.producto_id : ''))).toEqual(['2']); // el 15% solo vale para el producto 1
  });

  it('a todos los productos desde un mínimo por SKU: el que no llega queda sin descuento', () => {
    const T = [regla('todos-10', 5, [], { min_unidades_producto: 10 })];
    const c = ctx([linea('1', 10), linea('2', 10), linea('3', 12), linea('4', 5)]);
    const d = descuentosPorProducto(T, c);
    expect([...d.keys()].sort()).toEqual(['1', '2', '3']);
    expect(d.get('4')).toBeUndefined();
    expect(ofertaDeProducto(T, '9', { hoy: '2026-09-30' })).toEqual({ pct: 5, desde: 10 });
    // El servidor valida igual: 5% en la línea de 5 unidades excede el tope.
    const e = evaluarPedido(T, ctx([linea('1', 10, 5), linea('4', 5, 5)]));
    expect(e.violaciones.map((v) => ('producto_id' in v ? v.producto_id : ''))).toEqual(['4']);
  });

  it('una regla de línea sin productos ni mínimo es solo un tope (no se aplica sola)', () => {
    expect(descuentosPorProducto([regla('tope', 7, [])], ctx([linea('1', 50)])).size).toBe(0);
  });
});
