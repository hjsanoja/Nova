import type { SegmentoCliente, Violacion } from './types';

/**
 * Motor de políticas comerciales (regla 3). Es el espejo en TypeScript de app.regla_aplica /
 * app.evaluar_reglas_pedido del servidor: las reglas vigentes se cachean en el dispositivo para validar
 * topes sin conexión; al sincronizar, el servidor vuelve a evaluar y manda a "Revisión Especial" lo que exceda.
 */
export interface ReglaComercial {
  id: string;
  nombre: string;
  alcance: 'linea' | 'pedido';
  descuento_max_pct: number;
  min_skus_distintos?: number | null;
  min_unidades_totales?: number | null;
  min_unidades_categoria?: number | null;
  categoria_objetivo?: string | null;
  /** Descuento por producto: solo estos productos (vacío = regla general). */
  productos?: string[] | null;
  /** Descuento por producto: unidades mínimas de ESE producto en la línea. */
  min_unidades_producto?: number | null;
  bonificacion?: { por_cada: number; gratis: number } | null;
  equipo_id?: string | null;
  drogueria_id?: string | null;
  segmento_cliente?: SegmentoCliente | null;
  vigente_desde: string;
  vigente_hasta?: string | null;
  prioridad: number;
  activo: boolean;
}

export interface LineaEvaluable {
  producto_id: string;
  sku?: string;
  categoria?: string | null;
  unidades: number;
  descuento_pct?: number | null;
}

export interface ContextoPedido {
  equipo_id?: string | null;
  drogueria_id?: string | null;
  segmento?: SegmentoCliente;
  cliente_validado: boolean;
  lineas: LineaEvaluable[];
  descuento_pedido_pct?: number | null;
  /** YYYY-MM-DD; por defecto hoy. */
  hoy?: string;
  /** Descuento tolerado cuando ninguna regla aplica (config_sistema.descuento_max_sin_regla). */
  descuento_base?: number;
}

export interface Faltantes {
  skus: number;
  unidades: number;
  unidades_categoria: number;
}

export interface EstadoRegla {
  regla: ReglaComercial;
  aplica: boolean;
  faltantes: Faltantes;
}

export interface EvaluacionPedido {
  violaciones: Violacion[];
  requiere_revision_especial: boolean;
  cliente_no_validado: boolean;
  /** Motivos que retienen el pedido (violaciones + cliente sin validar). */
  motivos: Violacion[];
}

const fechaHoy = () => new Date().toISOString().slice(0, 10);

function totales(ctx: ContextoPedido) {
  const skus = new Set(ctx.lineas.map((l) => l.producto_id)).size;
  const unidades = ctx.lineas.reduce((a, l) => a + l.unidades, 0);
  return { skus, unidades };
}

/** ¿La regla es aplicable a este equipo/droguería/segmento y está vigente? (sin mirar umbrales) */
export function reglaEnAlcance(r: ReglaComercial, ctx: ContextoPedido): boolean {
  if (!r.activo) return false;
  const hoy = ctx.hoy ?? fechaHoy();
  if (hoy < r.vigente_desde || (r.vigente_hasta != null && hoy > r.vigente_hasta)) return false;
  if (r.equipo_id && r.equipo_id !== ctx.equipo_id) return false;
  if (r.drogueria_id && r.drogueria_id !== ctx.drogueria_id) return false;
  if (r.segmento_cliente && r.segmento_cliente !== ctx.segmento) return false;
  return true;
}

/** Cuánto falta para cumplir cada umbral (0 = cumplido). */
export function faltantesRegla(r: ReglaComercial, ctx: ContextoPedido): Faltantes {
  const { skus, unidades } = totales(ctx);
  const enCategoria = r.categoria_objetivo
    ? ctx.lineas.filter((l) => l.categoria === r.categoria_objetivo).reduce((a, l) => a + l.unidades, 0)
    : 0;
  return {
    skus: Math.max(0, (r.min_skus_distintos ?? 0) - skus),
    unidades: Math.max(0, (r.min_unidades_totales ?? 0) - unidades),
    unidades_categoria: r.min_unidades_categoria ? Math.max(0, r.min_unidades_categoria - enCategoria) : 0,
  };
}

export function reglaAplica(r: ReglaComercial, ctx: ContextoPedido): boolean {
  if (!reglaEnAlcance(r, ctx)) return false;
  const f = faltantesRegla(r, ctx);
  return f.skus === 0 && f.unidades === 0 && f.unidades_categoria === 0;
}

/** ¿Esta regla de línea alcanza a este producto? (lista de productos y mínimo de unidades de la línea) */
function alcanzaLinea(r: ReglaComercial, linea: LineaEvaluable): boolean {
  if (r.categoria_objetivo && r.categoria_objetivo !== linea.categoria) return false;
  if (r.productos?.length && !r.productos.includes(linea.producto_id)) return false;
  if (r.min_unidades_producto && linea.unidades < r.min_unidades_producto) return false;
  return true;
}

export function topeDescuentoLinea(reglas: ReglaComercial[], ctx: ContextoPedido, linea: LineaEvaluable): number {
  let tope = ctx.descuento_base ?? 0;
  let hay = false;
  for (const r of reglas) {
    if (r.alcance !== 'linea') continue;
    if (!alcanzaLinea(r, linea)) continue;
    if (!reglaAplica(r, ctx)) continue;
    tope = hay ? Math.max(tope, r.descuento_max_pct) : r.descuento_max_pct;
    hay = true;
  }
  return tope;
}

export function topeDescuentoPedido(reglas: ReglaComercial[], ctx: ContextoPedido): number {
  let tope = ctx.descuento_base ?? 0;
  let hay = false;
  for (const r of reglas) {
    if (r.alcance !== 'pedido' || !reglaAplica(r, ctx)) continue;
    tope = hay ? Math.max(tope, r.descuento_max_pct) : r.descuento_max_pct;
    hay = true;
  }
  return tope;
}

export function evaluarPedido(reglas: ReglaComercial[], ctx: ContextoPedido): EvaluacionPedido {
  const violaciones: Violacion[] = [];
  for (const l of ctx.lineas) {
    const d = l.descuento_pct ?? 0;
    if (d <= 0) continue;
    const maximo = topeDescuentoLinea(reglas, ctx, l);
    if (d > maximo) {
      violaciones.push({ tipo: 'descuento_linea_excedido', producto_id: l.producto_id, sku: l.sku, descuento: d, maximo });
    }
  }
  const dp = ctx.descuento_pedido_pct ?? 0;
  if (dp > 0) {
    const maximo = topeDescuentoPedido(reglas, ctx);
    if (dp > maximo) violaciones.push({ tipo: 'descuento_pedido_excedido', descuento: dp, maximo });
  }
  const motivos: Violacion[] = [...violaciones];
  if (!ctx.cliente_validado) motivos.push({ tipo: 'cliente_no_validado' });
  return {
    violaciones,
    requiere_revision_especial: violaciones.length > 0,
    cliente_no_validado: !ctx.cliente_validado,
    motivos,
  };
}

/** Reglas que el vendedor puede elegir como "condición comercial", con lo que le falta para activarlas. */
export function condicionesDisponibles(reglas: ReglaComercial[], ctx: ContextoPedido): EstadoRegla[] {
  return reglas
    .filter((r) => reglaEnAlcance(r, ctx))
    .map((regla) => {
      const faltantes = faltantesRegla(regla, ctx);
      return { regla, faltantes, aplica: faltantes.skus === 0 && faltantes.unidades === 0 && faltantes.unidades_categoria === 0 };
    })
    .sort((a, b) => Number(b.aplica) - Number(a.aplica) || a.regla.prioridad - b.regla.prioridad || b.regla.descuento_max_pct - a.regla.descuento_max_pct);
}

/** Texto corto para la interfaz: "faltan 2 SKUs y 10 uds". */
export function describirFaltantes(f: Faltantes): string {
  const partes: string[] = [];
  if (f.skus) partes.push(`${f.skus} SKU${f.skus === 1 ? '' : 's'} más`);
  if (f.unidades) partes.push(`${f.unidades} uds más`);
  if (f.unidades_categoria) partes.push(`${f.unidades_categoria} uds de la categoría`);
  return partes.length ? `Faltan ${partes.join(' y ')}` : 'Cumple';
}

/** Unidades de bonificación que otorgan las reglas aplicables (p. ej. 1 gratis por cada 10). */
export function bonificaciones(reglas: ReglaComercial[], ctx: ContextoPedido): { regla_id: string; producto_id: string; gratis: number }[] {
  const salida: { regla_id: string; producto_id: string; gratis: number }[] = [];
  for (const r of reglas) {
    if (!r.bonificacion || r.bonificacion.por_cada <= 0 || !reglaAplica(r, ctx)) continue;
    for (const l of ctx.lineas) {
      if (r.categoria_objetivo && r.categoria_objetivo !== l.categoria) continue;
      const gratis = Math.floor(l.unidades / r.bonificacion.por_cada) * r.bonificacion.gratis;
      if (gratis > 0) salida.push({ regla_id: r.id, producto_id: l.producto_id, gratis });
    }
  }
  return salida;
}

export interface CondicionPedido {
  /** La condición de pedido con mayor descuento que ya se cumple (si hay). */
  aplicada: { regla: ReglaComercial; pct: number } | null;
  /** La siguiente condición de mayor descuento que aún no se cumple, con lo que falta. */
  siguiente: { regla: ReglaComercial; faltantes: Faltantes } | null;
}

/**
 * Descuento automático del pedido según las condiciones comerciales (alcance "pedido"): se aplica la de mayor % que se
 * cumple (mínimo de SKU distintos, de unidades, o ambos) y se informa la siguiente para motivar a completar el pedido.
 */
export function condicionDelPedido(reglas: ReglaComercial[], ctx: ContextoPedido): CondicionPedido {
  const enAlcance = reglas.filter((r) => r.alcance === 'pedido' && reglaEnAlcance(r, ctx));
  let aplicada: CondicionPedido['aplicada'] = null;
  let siguiente: CondicionPedido['siguiente'] = null;
  for (const r of enAlcance) {
    const f = faltantesRegla(r, ctx);
    const cumple = f.skus === 0 && f.unidades === 0 && f.unidades_categoria === 0;
    if (cumple) {
      if (!aplicada || r.descuento_max_pct > aplicada.pct) aplicada = { regla: r, pct: r.descuento_max_pct };
    }
  }
  for (const r of enAlcance) {
    if (r.descuento_max_pct <= (aplicada?.pct ?? 0)) continue;
    const f = faltantesRegla(r, ctx);
    if (f.skus === 0 && f.unidades === 0 && f.unidades_categoria === 0) continue;
    const esfuerzo = (x: Faltantes) => x.skus * 10 + x.unidades;
    // La más cercana de alcanzar; a igual esfuerzo, la de mayor descuento.
    if (!siguiente || esfuerzo(f) < esfuerzo(siguiente.faltantes) || (esfuerzo(f) === esfuerzo(siguiente.faltantes) && r.descuento_max_pct > siguiente.regla.descuento_max_pct)) {
      siguiente = { regla: r, faltantes: f };
    }
  }
  return { aplicada, siguiente };
}

/** "5 productos distintos y 100 unidades" / "Sin mínimo". */
export function describirRequisitos(r: Pick<ReglaComercial, 'min_skus_distintos' | 'min_unidades_totales'>): string {
  const partes: string[] = [];
  if (r.min_skus_distintos) partes.push(`${r.min_skus_distintos} producto${r.min_skus_distintos === 1 ? '' : 's'} distinto${r.min_skus_distintos === 1 ? '' : 's'}`);
  if (r.min_unidades_totales) partes.push(`${r.min_unidades_totales} unidades`);
  return partes.length ? `Desde ${partes.join(' y ')}` : 'Sin mínimo';
}

// ---------------------------------------------------------------------------- descuentos por producto

export const esDescuentoPorProducto = (r: Pick<ReglaComercial, 'alcance' | 'productos'>) => r.alcance === 'linea' && (r.productos?.length ?? 0) > 0;

/**
 * Descuento automático de cada línea: el mayor de los "descuentos por producto" vigentes que alcanzan a ese producto
 * (y cuyo mínimo de unidades del producto y, si los tiene, mínimos del pedido se cumplen).
 */
export function descuentosPorProducto(reglas: ReglaComercial[], ctx: ContextoPedido): Map<string, { pct: number; regla: ReglaComercial }> {
  const salida = new Map<string, { pct: number; regla: ReglaComercial }>();
  const aplicables = reglas.filter((r) => esDescuentoPorProducto(r) && reglaAplica(r, ctx));
  for (const l of ctx.lineas) {
    for (const r of aplicables) {
      if (!alcanzaLinea(r, l)) continue;
      const actual = salida.get(l.producto_id);
      if (!actual || r.descuento_max_pct > actual.pct) salida.set(l.producto_id, { pct: r.descuento_max_pct, regla: r });
    }
  }
  return salida;
}

/** Oferta que se muestra en el catálogo: el mayor descuento vigente de un producto y desde cuántas unidades. */
export function ofertaDeProducto(reglas: ReglaComercial[], productoId: string, ctx: Pick<ContextoPedido, 'drogueria_id' | 'segmento' | 'equipo_id' | 'hoy'>): { pct: number; desde: number | null } | null {
  let mejor: { pct: number; desde: number | null } | null = null;
  for (const r of reglas) {
    if (!esDescuentoPorProducto(r) || !r.productos!.includes(productoId)) continue;
    if (!reglaEnAlcance(r, { ...ctx, cliente_validado: true, lineas: [] })) continue;
    if (!mejor || r.descuento_max_pct > mejor.pct) mejor = { pct: r.descuento_max_pct, desde: r.min_unidades_producto ?? null };
  }
  return mejor;
}
