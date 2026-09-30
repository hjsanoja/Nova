// Varios carritos a la vez: uno por farmacia. El vendedor arma los pedidos de varios clientes (por ejemplo, en una
// ruta o dictando) y los envía juntos. Modelo puro (sin React ni base de datos) para poder probarlo.

export interface LineaCarrito {
  producto_id: string;
  unidades: number;
}

export interface Carrito {
  id: string;
  cliente_id: string;
  drogueria_id: string | null;
  lineas: LineaCarrito[];
  observaciones: string;
  creado_en: string;
}

export interface EstadoCarritos {
  /** Carrito en el que se agregan los productos del catálogo. */
  activo: string | null;
  carritos: Carrito[];
}

export const SIN_CARRITOS: EstadoCarritos = { activo: null, carritos: [] };

export type AccionCarritos =
  | { tipo: 'cargar'; estado: EstadoCarritos }
  /** Activa el carrito de esa farmacia; si no existe, lo crea (con la droguería sugerida). */
  | { tipo: 'abrir'; cliente_id: string; drogueria_id?: string | null; id?: string; ahora?: string }
  | { tipo: 'activar'; id: string }
  /** Suma unidades al carrito activo (o al indicado). */
  | { tipo: 'agregar'; producto_id: string; unidades: number; carrito_id?: string }
  /** Suma varias líneas al carrito de una farmacia (lo abre si no existe): dictado, sugerido, repetir pedido. */
  | { tipo: 'agregar_varios'; cliente_id: string; lineas: LineaCarrito[]; drogueria_id?: string | null; id?: string; ahora?: string }
  | { tipo: 'unidades'; carrito_id: string; producto_id: string; unidades: number }
  | { tipo: 'drogueria'; carrito_id: string; drogueria_id: string | null }
  | { tipo: 'observaciones'; carrito_id: string; texto: string }
  | { tipo: 'quitar'; carrito_id: string }
  /** Quita los carritos ya enviados. */
  | { tipo: 'enviados'; ids: string[] };

const nuevoId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

function sumar(lineas: LineaCarrito[], producto_id: string, unidades: number): LineaCarrito[] {
  if (unidades <= 0) return lineas;
  const i = lineas.findIndex((l) => l.producto_id === producto_id);
  if (i < 0) return [...lineas, { producto_id, unidades }];
  return lineas.map((l, k) => (k === i ? { ...l, unidades: l.unidades + unidades } : l));
}

function conCarrito(s: EstadoCarritos, cliente_id: string, drogueria_id: string | null | undefined, id: string | undefined, ahora: string | undefined): { estado: EstadoCarritos; carrito: Carrito } {
  const existente = s.carritos.find((c) => c.cliente_id === cliente_id);
  if (existente) return { estado: s, carrito: existente };
  const carrito: Carrito = { id: id ?? nuevoId(), cliente_id, drogueria_id: drogueria_id ?? null, lineas: [], observaciones: '', creado_en: ahora ?? new Date().toISOString() };
  return { estado: { ...s, carritos: [...s.carritos, carrito] }, carrito };
}

const actualizar = (s: EstadoCarritos, id: string, f: (c: Carrito) => Carrito): EstadoCarritos => ({ ...s, carritos: s.carritos.map((c) => (c.id === id ? f(c) : c)) });

export function reductorCarritos(s: EstadoCarritos, a: AccionCarritos): EstadoCarritos {
  switch (a.tipo) {
    case 'cargar':
      return a.estado;
    case 'abrir': {
      const { estado, carrito } = conCarrito(s, a.cliente_id, a.drogueria_id, a.id, a.ahora);
      return { ...estado, activo: carrito.id };
    }
    case 'activar':
      return s.carritos.some((c) => c.id === a.id) ? { ...s, activo: a.id } : s;
    case 'agregar': {
      const destino = a.carrito_id ?? s.activo;
      if (!destino) return s;
      return actualizar(s, destino, (c) => ({ ...c, lineas: sumar(c.lineas, a.producto_id, Math.floor(a.unidades)) }));
    }
    case 'agregar_varios': {
      const { estado, carrito } = conCarrito(s, a.cliente_id, a.drogueria_id, a.id, a.ahora);
      const conLineas = actualizar(estado, carrito.id, (c) => ({ ...c, lineas: a.lineas.reduce((acc, l) => sumar(acc, l.producto_id, Math.floor(l.unidades)), c.lineas) }));
      return { ...conLineas, activo: carrito.id };
    }
    case 'unidades':
      return actualizar(s, a.carrito_id, (c) => ({
        ...c,
        lineas: a.unidades <= 0 ? c.lineas.filter((l) => l.producto_id !== a.producto_id) : c.lineas.map((l) => (l.producto_id === a.producto_id ? { ...l, unidades: Math.floor(a.unidades) } : l)),
      }));
    case 'drogueria':
      return actualizar(s, a.carrito_id, (c) => ({ ...c, drogueria_id: a.drogueria_id }));
    case 'observaciones':
      return actualizar(s, a.carrito_id, (c) => ({ ...c, observaciones: a.texto }));
    case 'quitar':
    case 'enviados': {
      const fuera = new Set(a.tipo === 'quitar' ? [a.carrito_id] : a.ids);
      const carritos = s.carritos.filter((c) => !fuera.has(c.id));
      const activo = s.activo && !fuera.has(s.activo) ? s.activo : carritos[carritos.length - 1]?.id ?? null;
      return { activo, carritos };
    }
  }
}

export interface TotalesCarrito {
  productos: number;
  unidades: number;
}

export const totales = (c: Pick<Carrito, 'lineas'>): TotalesCarrito => ({ productos: c.lineas.length, unidades: c.lineas.reduce((a, l) => a + l.unidades, 0) });

/** Qué impide enviar un carrito (vacío = listo). */
export function faltaParaEnviar(c: Carrito): string[] {
  const f: string[] = [];
  if (c.lineas.length === 0) f.push('Agrega al menos un producto');
  if (!c.drogueria_id) f.push('Elige la droguería');
  return f;
}
