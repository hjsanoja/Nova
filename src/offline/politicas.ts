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

export function topeDescuentoLinea(reglas: ReglaComercial[], ctx: ContextoPedido, linea: LineaEvaluable): number {
  let tope = ctx.descuento_base ?? 0;
  let hay = false;
  for (const r of reglas) {
    if (r.alcance !== 'linea') continue;
    if (r.categoria_objetivo && r.categoria_objetivo !== linea.categoria) continue;
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
