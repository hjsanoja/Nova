import type { NovaDB } from './db';
import type { LocalCliente, LocalProducto } from './types';

/**
 * Pedido sugerido inteligente (módulo C.3), calculado en el dispositivo sobre el historial local:
 *   base    = promedio de unidades del producto en las últimas 3 compras de la farmacia
 *   factor  = días desde su último pedido / frecuencia de visita (acotado a 0.5 – 1.5)
 *   sugerido = base × factor, redondeado hacia arriba al empaque mínimo
 * Una farmacia que lleva más tiempo sin comprar que su ciclo recibe más; una que compró hace poco, menos.
 */
export interface LineaSugerida {
  producto: LocalProducto;
  unidades: number;
  promedio: number;
  compras: number;
}

export const FACTOR_MIN = 0.5;
export const FACTOR_MAX = 1.5;

export function factorDeFrecuencia(diasDesdeUltimo: number | null, frecuenciaDias: number | null | undefined): number {
  if (diasDesdeUltimo == null || !frecuenciaDias || frecuenciaDias <= 0) return 1;
  return Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, diasDesdeUltimo / frecuenciaDias));
}

export function redondearAEmpaque(unidades: number, empaque: number): number {
  const e = Math.max(1, empaque);
  return Math.max(e, Math.ceil(unidades / e) * e);
}

/**
 * Cuando la farmacia aún no tiene pedidos hechos por Nova, la "última compra" sale del consolidado mensual que
 * reportan las droguerías (fact_compras_mensual): promedio de los últimos 3 meses en que compró cada producto,
 * dividido entre los meses considerados. Sin fecha exacta de compra, el factor de ciclo se calcula con la última compra del mes.
 */
async function sugeridoDesdeHistorial(db: NovaDB, cliente: LocalCliente, ahora: Date): Promise<LineaSugerida[]> {
  const compras = await db.comprasMensual.where('cliente_id').equals(cliente.id).toArray();
  if (compras.length === 0) return [];
  const periodos = Array.from(new Set(compras.map((c) => c.periodo))).sort().reverse().slice(0, 3);
  const validos = new Set(periodos);
  const porProducto = new Map<string, number[]>();
  for (const c of compras) {
    if (!validos.has(c.periodo)) continue;
    porProducto.set(c.producto_id, [...(porProducto.get(c.producto_id) ?? []), c.unidades]);
  }
  const ultima = compras.reduce((m, c) => (c.ultima_compra > m ? c.ultima_compra : m), '');
  const dias = Math.floor((ahora.getTime() - new Date(ultima).getTime()) / 86_400_000);
  const factor = factorDeFrecuencia(dias, cliente.frecuencia_dias);
  const productos = await db.productos.bulkGet(Array.from(porProducto.keys()));
  const lineas: LineaSugerida[] = [];
  productos.forEach((producto) => {
    if (!producto || !producto.activo) return;
    const meses = porProducto.get(producto.id) ?? [];
    const promedio = meses.reduce((a, b) => a + b, 0) / periodos.length;
    lineas.push({ producto, promedio, compras: meses.length, unidades: redondearAEmpaque(promedio * factor, producto.empaque_minimo) });
  });
  return lineas.sort((a, b) => b.unidades - a.unidades);
}

export async function calcularSugerido(db: NovaDB, cliente: LocalCliente, ahora = new Date()): Promise<LineaSugerida[]> {
  const pedidos = (await db.pedidos.where('cliente_id').equals(cliente.id).toArray())
    .filter((p) => !['borrador', 'cancelado', 'rechazado'].includes(p.estado))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 3);
  if (pedidos.length === 0) return sugeridoDesdeHistorial(db, cliente, ahora);

  const detalles = await db.detalles.where('pedido_id').anyOf(pedidos.map((p) => p.id)).toArray();
  const porProducto = new Map<string, number[]>();
  for (const d of detalles) {
    // Lo confirmado por la droguería refleja la compra real; si aún no hay confirmación, lo solicitado.
    const u = d.unidades_confirmadas ?? d.unidades_solicitadas;
    porProducto.set(d.producto_id, [...(porProducto.get(d.producto_id) ?? []), u]);
  }

  const dias = Math.floor((ahora.getTime() - new Date(pedidos[0].created_at).getTime()) / 86_400_000);
  const factor = factorDeFrecuencia(dias, cliente.frecuencia_dias);
  const productos = await db.productos.bulkGet(Array.from(porProducto.keys()));

  const lineas: LineaSugerida[] = [];
  productos.forEach((producto) => {
    if (!producto || !producto.activo) return;
    const compras = porProducto.get(producto.id) ?? [];
    // Se divide entre el número de pedidos considerados: un producto que faltó en alguno promedia más bajo.
    const promedio = compras.reduce((a, b) => a + b, 0) / pedidos.length;
    lineas.push({ producto, promedio, compras: compras.length, unidades: redondearAEmpaque(promedio * factor, producto.empaque_minimo) });
  });
  return lineas.sort((a, b) => b.unidades - a.unidades);
}

/** Productos que la farmacia compró en sus últimos pedidos, por volumen: atajo de reposición cuando la búsqueda está vacía. */
export async function productosComprados(db: NovaDB, clienteId: string | null, limite = 8): Promise<LocalProducto[]> {
  if (!clienteId) return [];
  const pedidos = (await db.pedidos.where('cliente_id').equals(clienteId).toArray())
    .filter((p) => !['borrador', 'cancelado', 'rechazado'].includes(p.estado))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 3);
  if (pedidos.length === 0) {
    // Sin pedidos de Nova: lo que la farmacia compró en los últimos meses según las droguerías.
    const compras = (await db.comprasMensual.where('cliente_id').equals(clienteId).toArray()).sort((a, b) => b.periodo.localeCompare(a.periodo));
    const periodos = new Set(Array.from(new Set(compras.map((c) => c.periodo))).slice(0, 3));
    const total = new Map<string, number>();
    compras.filter((c) => periodos.has(c.periodo)).forEach((c) => total.set(c.producto_id, (total.get(c.producto_id) ?? 0) + c.unidades));
    const ids = Array.from(total.entries()).sort((a, b) => b[1] - a[1]).slice(0, limite).map(([id]) => id);
    return (await db.productos.bulkGet(ids)).filter((p): p is LocalProducto => !!p && p.activo);
  }
  const detalles = await db.detalles.where('pedido_id').anyOf(pedidos.map((p) => p.id)).toArray();
  const total = new Map<string, number>();
  detalles.forEach((d) => total.set(d.producto_id, (total.get(d.producto_id) ?? 0) + (d.unidades_confirmadas ?? d.unidades_solicitadas)));
  const ids = Array.from(total.entries()).sort((a, b) => b[1] - a[1]).slice(0, limite).map(([id]) => id);
  return (await db.productos.bulkGet(ids)).filter((p): p is LocalProducto => !!p && p.activo);
}
