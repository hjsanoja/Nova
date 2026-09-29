import { useEffect, useReducer, useRef, useState } from 'react';
import type { NovaDB } from '../../offline/db';
import type { LocalProducto } from '../../offline/types';

export interface LineaCarrito {
  producto: LocalProducto;
  unidades: number;
  descuento_pct: number;
}

export interface EstadoCarrito {
  cliente_id: string | null;
  drogueria_id: string | null;
  lineas: LineaCarrito[];
  observaciones: string;
  condicion_id: string | null;
  descuento_pedido_pct: number;
}

export type AccionCarrito =
  | { tipo: 'cargar'; estado: EstadoCarrito }
  | { tipo: 'cliente'; id: string | null }
  | { tipo: 'drogueria'; id: string | null }
  | { tipo: 'agregar'; producto: LocalProducto; unidades?: number }
  | { tipo: 'agregar_varios'; lineas: { producto: LocalProducto; unidades: number }[] }
  | { tipo: 'unidades'; productoId: string; unidades: number }
  | { tipo: 'descuento'; productoId: string; pct: number }
  | { tipo: 'descuento_todas'; pct: number }
  | { tipo: 'quitar'; productoId: string }
  | { tipo: 'observaciones'; texto: string }
  | { tipo: 'condicion'; id: string | null }
  | { tipo: 'descuento_pedido'; pct: number }
  | { tipo: 'vaciar_lineas' };

export const CARRITO_VACIO: EstadoCarrito = {
  cliente_id: null,
  drogueria_id: null,
  lineas: [],
  observaciones: '',
  condicion_id: null,
  descuento_pedido_pct: 0,
};

const acotar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));

function sumar(lineas: LineaCarrito[], producto: LocalProducto, unidades: number): LineaCarrito[] {
  const i = lineas.findIndex((l) => l.producto.id === producto.id);
  if (i >= 0) return lineas.map((l, k) => (k === i ? { ...l, unidades: l.unidades + unidades } : l));
  return [...lineas, { producto, unidades, descuento_pct: 0 }];
}

export function reductorCarrito(s: EstadoCarrito, a: AccionCarrito): EstadoCarrito {
  switch (a.tipo) {
    case 'cargar':
      return a.estado;
    case 'cliente':
      // Cambiar de farmacia limpia la condición elegida: dependía del segmento del cliente anterior.
      return { ...s, cliente_id: a.id, condicion_id: null };
    case 'drogueria':
      return { ...s, drogueria_id: a.id, condicion_id: null };
    case 'agregar':
      return { ...s, lineas: sumar(s.lineas, a.producto, a.unidades ?? Math.max(1, a.producto.empaque_minimo)) };
    case 'agregar_varios':
      return { ...s, lineas: a.lineas.reduce((acc, l) => sumar(acc, l.producto, l.unidades), s.lineas) };
    case 'unidades':
      return a.unidades <= 0
        ? { ...s, lineas: s.lineas.filter((l) => l.producto.id !== a.productoId) }
        : { ...s, lineas: s.lineas.map((l) => (l.producto.id === a.productoId ? { ...l, unidades: Math.floor(a.unidades) } : l)) };
    case 'descuento':
      return { ...s, lineas: s.lineas.map((l) => (l.producto.id === a.productoId ? { ...l, descuento_pct: acotar(a.pct, 0, 100) } : l)) };
    case 'descuento_todas':
      return { ...s, lineas: s.lineas.map((l) => ({ ...l, descuento_pct: acotar(a.pct, 0, 100) })) };
    case 'quitar':
      return { ...s, lineas: s.lineas.filter((l) => l.producto.id !== a.productoId) };
    case 'observaciones':
      return { ...s, observaciones: a.texto };
    case 'condicion':
      return { ...s, condicion_id: a.id };
    case 'descuento_pedido':
      return { ...s, descuento_pedido_pct: acotar(a.pct, 0, 100) };
    case 'vaciar_lineas':
      return { ...CARRITO_VACIO, cliente_id: s.cliente_id, drogueria_id: s.drogueria_id };
  }
}

interface BorradorGuardado {
  cliente_id: string | null;
  drogueria_id: string | null;
  lineas: { producto_id: string; unidades: number; descuento_pct: number }[];
  observaciones: string;
  condicion_id: string | null;
  descuento_pedido_pct: number;
}

const CLAVE = 'borrador_captura';

/** Carrito con borrador persistente: si el vendedor cierra la app o se queda sin batería, no pierde lo capturado. */
export function useCarrito(db: NovaDB) {
  const [carrito, dispatch] = useReducer(reductorCarrito, CARRITO_VACIO);
  const [cargado, setCargado] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const b = await db.leerMeta<BorradorGuardado | null>(CLAVE, null);
      if (b && !cancelado) {
        const productos = await db.productos.bulkGet(b.lineas.map((l) => l.producto_id));
        const lineas = b.lineas.flatMap((l, i) => (productos[i] ? [{ producto: productos[i]!, unidades: l.unidades, descuento_pct: l.descuento_pct }] : []));
        dispatch({ tipo: 'cargar', estado: { ...CARRITO_VACIO, ...b, lineas } });
      }
      if (!cancelado) setCargado(true);
    })();
    return () => {
      cancelado = true;
    };
  }, [db]);

  useEffect(() => {
    if (!cargado) return;
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      const b: BorradorGuardado = {
        cliente_id: carrito.cliente_id,
        drogueria_id: carrito.drogueria_id,
        lineas: carrito.lineas.map((l) => ({ producto_id: l.producto.id, unidades: l.unidades, descuento_pct: l.descuento_pct })),
        observaciones: carrito.observaciones,
        condicion_id: carrito.condicion_id,
        descuento_pedido_pct: carrito.descuento_pedido_pct,
      };
      void db.guardarMeta(CLAVE, b);
    }, 400);
    return () => clearTimeout(temporizador.current);
  }, [carrito, cargado, db]);

  return { carrito, dispatch, cargado };
}
