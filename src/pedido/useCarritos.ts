import { useEffect, useReducer, useRef, useState } from 'react';
import type { NovaDB } from '../offline/db';
import { crearPedidoLocal } from '../offline/pedidos';
import type { Sesion } from '../offline/pedidos';
import { condicionDelPedido } from '../offline/politicas';
import type { ContextoPedido, ReglaComercial } from '../offline/politicas';
import type { LocalCliente, LocalProducto } from '../offline/types';
import { SIN_CARRITOS, reductorCarritos } from './carritos';
import type { Carrito, EstadoCarritos } from './carritos';

const CLAVE = 'carritos_v2';
/** Borrador de la pantalla anterior (un solo carrito): se convierte al abrir por primera vez. */
const CLAVE_ANTERIOR = 'borrador_captura';

/** Carritos guardados en el dispositivo: sobreviven a cerrar la app, quedarse sin batería o perder la señal. */
export function useCarritos(db: NovaDB) {
  const [estado, dispatch] = useReducer(reductorCarritos, SIN_CARRITOS);
  const [cargado, setCargado] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      let guardado = await db.leerMeta<EstadoCarritos | null>(CLAVE, null);
      if (!guardado) {
        const anterior = await db.leerMeta<{ cliente_id: string | null; drogueria_id: string | null; lineas: { producto_id: string; unidades: number }[] } | null>(CLAVE_ANTERIOR, null);
        if (anterior?.cliente_id && anterior.lineas.length) {
          const id = crypto.randomUUID();
          guardado = { activo: id, carritos: [{ id, cliente_id: anterior.cliente_id, drogueria_id: anterior.drogueria_id, lineas: anterior.lineas.map((l) => ({ producto_id: l.producto_id, unidades: l.unidades })), observaciones: '', creado_en: new Date().toISOString() }] };
        }
        await db.meta.delete(CLAVE_ANTERIOR);
      }
      if (guardado && !cancelado) dispatch({ tipo: 'cargar', estado: guardado });
      if (!cancelado) setCargado(true);
    })();
    return () => { cancelado = true; };
  }, [db]);

  useEffect(() => {
    if (!cargado) return;
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => void db.guardarMeta(CLAVE, estado), 300);
    return () => clearTimeout(temporizador.current);
  }, [estado, cargado, db]);

  return { estado, dispatch, cargado };
}

/** Contexto para evaluar las condiciones comerciales de un carrito. */
export function contextoCarrito(c: Carrito, productos: Map<string, LocalProducto>, cliente: LocalCliente | undefined): ContextoPedido {
  return {
    drogueria_id: c.drogueria_id,
    segmento: cliente?.segmento,
    cliente_validado: cliente?.estado_validacion === 'activo',
    lineas: c.lineas.map((l) => ({ producto_id: l.producto_id, sku: productos.get(l.producto_id)?.sku, categoria: productos.get(l.producto_id)?.categoria ?? null, unidades: l.unidades })),
  };
}

export interface ResultadoEnvio {
  carrito_id: string;
  cliente_id: string;
  ok: boolean;
  correlativo?: string;
  enRevision?: boolean;
  error?: string;
}

/**
 * Convierte los carritos en pedidos (sin conexión: quedan en la cola y se envían al volver la señal). Cada pedido lleva
 * el descuento de la mejor condición comercial que cumple. Un carrito que falla no impide enviar los demás.
 */
export async function enviarCarritos(
  db: NovaDB,
  carritos: Carrito[],
  datos: { reglas: ReglaComercial[]; productos: Map<string, LocalProducto>; clientes: Map<string, LocalCliente>; sesion: Sesion }
): Promise<ResultadoEnvio[]> {
  const resultados: ResultadoEnvio[] = [];
  for (const c of carritos) {
    try {
      if (!c.drogueria_id) throw new Error('Falta la droguería');
      const { aplicada } = condicionDelPedido(datos.reglas, contextoCarrito(c, datos.productos, datos.clientes.get(c.cliente_id)));
      const pedido = await crearPedidoLocal(
        db,
        {
          cliente_id: c.cliente_id,
          drogueria_id: c.drogueria_id,
          lineas: c.lineas.map((l) => ({ producto_id: l.producto_id, unidades: l.unidades })),
          observaciones: c.observaciones.trim() || null,
          condicion_comercial_id: aplicada?.regla.id ?? null,
          descuento_pedido_pct: aplicada?.pct ?? null,
          enviar: true,
        },
        datos.sesion
      );
      await db.guardarMeta('ultima_drogueria', c.drogueria_id);
      resultados.push({ carrito_id: c.id, cliente_id: c.cliente_id, ok: true, correlativo: pedido.correlativo, enRevision: pedido.estado === 'en_revision' });
    } catch (e: unknown) {
      resultados.push({ carrito_id: c.id, cliente_id: c.cliente_id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return resultados;
}
