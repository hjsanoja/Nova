import { useMemo, useState } from 'react';
import { CornerDownRight, RefreshCw, Search, ShoppingBag } from 'lucide-react';
import type { Usuario } from '../types/pharmacy';
import type { LocalPedido, Violacion } from '../offline/types';
import { obtenerDb } from '../offline/db';
import { reintentarAhora } from '../offline/outbox';
import { reruteoLocal } from '../offline/pedidos';
import { solicitarSync } from '../offline/motor';
import { Sheet } from '../components/capture/Sheet';
import { Boton, Etiqueta, PageHeader, Segmentado, Tarjeta, Vacio, estiloInput, useAviso, useDebounced } from '../components/ui/kit';
import { contarPorGrupo, detallesPorPedido, ESTADOS_ETIQUETA, filtrarPedidos, GRUPOS_ESTADO, unidadesDePedido } from './logica';
import type { GrupoEstado } from './logica';
import { useClientes, useDetalles, useDroguerias, usePedidos, useProductos } from './useDatos';

const MOTIVOS: Record<string, string> = {
  quiebre_stock_drogueria: 'Sin stock en la droguería',
  limite_credito: 'Límite de crédito',
  producto_descontinuado: 'Producto descontinuado',
  ajuste_comercial: 'Ajuste comercial',
  otro: 'Otro motivo',
};

export function describirViolacion(v: Violacion): string {
  if (v.tipo === 'descuento_linea_excedido') return `Descuento de ${v.descuento}% en ${v.sku ?? 'una línea'} supera el tope de ${v.maximo}%.`;
  if (v.tipo === 'descuento_pedido_excedido') return `Descuento del pedido (${v.descuento}%) supera el tope de ${v.maximo}%.`;
  return 'La farmacia aún no está validada: el pedido espera aprobación.';
}

/** Pedidos: un vendedor ve los suyos; la mesa, la gerencia y el administrador ven todos. */
export function PedidosVista({ usuario }: { usuario: Usuario }) {
  const db = obtenerDb();
  const esVendedor = usuario.rol === 'vendedor';
  const todos = usePedidos();
  const detalles = useDetalles();
  const clientes = useClientes();
  const droguerias = useDroguerias();
  const productos = useProductos();
  const [grupo, setGrupo] = useState<GrupoEstado>('todos');
  const [texto, setTexto] = useState('');
  const q = useDebounced(texto, 150);
  const [abierto, setAbierto] = useState<string | null>(null);
  const { mostrar, nodo } = useAviso();

  const pedidos = useMemo(() => (esVendedor ? todos.filter((p) => p.vendedor_id === usuario.id) : todos), [todos, esVendedor, usuario.id]);
  const nombreCliente = useMemo(() => {
    const m = new Map(clientes.map((c) => [c.id, c.nombre_comercial]));
    return (id: string) => m.get(id) ?? 'Farmacia';
  }, [clientes]);
  const nombreDrogueria = (id: string) => droguerias.find((d) => d.id === id)?.nombre ?? 'Droguería';
  const porPedido = useMemo(() => detallesPorPedido(detalles), [detalles]);
  const cuentas = useMemo(() => contarPorGrupo(pedidos), [pedidos]);
  const lista = useMemo(() => filtrarPedidos(pedidos, { grupo, texto: q }, nombreCliente).slice(0, 200), [pedidos, grupo, q, nombreCliente]);
  const actual = abierto ? todos.find((p) => p.id === abierto) : undefined;

  return (
    <div>
      <PageHeader titulo={esVendedor ? 'Mis pedidos' : 'Pedidos'} descripcion="Toca un pedido para ver su detalle." />
      {nodo}
      <Segmentado opciones={GRUPOS_ESTADO.map((g) => ({ id: g.id, texto: g.texto, cuenta: cuentas[g.id] }))} valor={grupo} onChange={setGrupo} />
      <div className="relative mb-3 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por número o farmacia" aria-label="Buscar pedido" className={`${estiloInput} pl-9`} />
      </div>

      <Tarjeta className="!p-0">
        {lista.length === 0 ? (
          <Vacio icono={ShoppingBag} titulo="No hay pedidos aquí" texto={pedidos.length === 0 ? (esVendedor ? 'Cuando tomes un pedido aparecerá en esta lista.' : 'Aún no se han tomado pedidos.') : 'Cambia el filtro o la búsqueda.'} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {lista.map((p) => {
              const u = unidadesDePedido(porPedido.get(p.id) ?? []);
              const e = ESTADOS_ETIQUETA[p.estado];
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => setAbierto(p.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{nombreCliente(p.cliente_id)}</p>
                      <p className="truncate text-xs text-slate-500">
                        {p.correlativo} · {nombreDrogueria(p.drogueria_id)} · {u.solicitadas} uds · {new Date(p.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Etiqueta tono={e.tono}>{e.texto}</Etiqueta>
                      {p.sync_estado !== 'sincronizado' && <Etiqueta tono={p.sync_estado === 'pendiente' ? 'ambar' : 'rojo'}>{p.sync_estado === 'pendiente' ? 'Sin enviar' : 'Con error'}</Etiqueta>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>

      <Sheet abierto={!!actual} titulo={actual ? `${actual.correlativo}` : ''} onCerrar={() => setAbierto(null)} ancho="md:max-w-2xl">
        {actual && (
          <Detalle
            pedido={actual}
            cliente={nombreCliente(actual.cliente_id)}
            drogueria={nombreDrogueria(actual.drogueria_id)}
            lineas={(porPedido.get(actual.id) ?? []).map((d) => ({ ...d, nombre: productos.find((p) => p.id === d.producto_id)?.nombre_comercial ?? 'Producto', sku: productos.find((p) => p.id === d.producto_id)?.sku ?? '' }))}
            origen={actual.parent_pedido_id ? todos.find((p) => p.id === actual.parent_pedido_id)?.correlativo : undefined}
            puedeRerutear={(esVendedor && actual.vendedor_id === usuario.id) || usuario.rol === 'admin'}
            otrasDroguerias={droguerias.filter((d) => d.activo && d.id !== actual.drogueria_id)}
            onRerutear={async (drogId) => {
              try {
                const hijo = await reruteoLocal(db, actual.id, drogId);
                solicitarSync();
                mostrar({ tipo: 'ok', texto: `Se creó ${hijo.correlativo} con lo pendiente${navigator.onLine ? '' : ' (se enviará al recuperar la señal)'}.` });
                setAbierto(null);
              } catch (e) {
                mostrar({ tipo: 'error', texto: e instanceof Error ? e.message : String(e) });
              }
            }}
            onReintentar={async () => {
              await reintentarAhora(db);
              solicitarSync();
              mostrar({ tipo: 'ok', texto: 'Reintentando el envío…' });
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function Detalle({
  pedido: p, cliente, drogueria, lineas, origen, puedeRerutear, otrasDroguerias, onRerutear, onReintentar,
}: {
  pedido: LocalPedido;
  cliente: string;
  drogueria: string;
  lineas: { id: string; nombre: string; sku: string; unidades_solicitadas: number; unidades_confirmadas: number | null; unidades_pendientes: number; motivo_ajuste: string; remanente_derivado_en?: string | null }[];
  origen?: string;
  puedeRerutear: boolean;
  otrasDroguerias: { id: string; nombre: string }[];
  onRerutear: (drogueriaId: string) => void;
  onReintentar: () => void;
}) {
  const [destino, setDestino] = useState('');
  const e = ESTADOS_ETIQUETA[p.estado];
  const pendientes = lineas.filter((l) => l.unidades_pendientes > 0 && !l.remanente_derivado_en);
  const puedeDerivar = puedeRerutear && p.estado === 'procesado_parcial' && pendientes.length > 0;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Etiqueta tono={e.tono}>{e.texto}</Etiqueta>
        <span className="font-semibold">{cliente}</span>
        <span className="text-slate-500">· {drogueria}</span>
      </div>
      <p className="text-xs text-slate-500">
        {new Date(p.created_at).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}
        {p.numero_factura ? ` · Factura ${p.numero_factura}` : ''}
        {origen ? ` · Deriva de ${origen}` : ''}
      </p>

      {p.sync_estado !== 'sincronizado' && (
        <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs ${p.sync_estado === 'pendiente' ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200' : 'bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200'}`}>
          <span>{p.sync_estado === 'pendiente' ? 'Guardado en este dispositivo; se enviará al recuperar la señal.' : p.sync_error ?? 'El servidor rechazó este pedido.'}</span>
          <Boton icono={RefreshCw} onClick={onReintentar}>Reintentar</Boton>
        </div>
      )}

      {p.motivos_revision.length > 0 && p.estado === 'en_revision' && (
        <ul className="list-disc space-y-0.5 rounded-xl bg-amber-50 py-2 pl-7 pr-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {p.motivos_revision.map((v, i) => <li key={i}>{describirViolacion(v)}</li>)}
        </ul>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/60">
            <tr><th className="px-2.5 py-1.5">Producto</th><th className="px-2 text-right">Pedidas</th><th className="px-2 text-right">Confirmadas</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {lineas.map((l) => (
              <tr key={l.id}>
                <td className="px-2.5 py-1.5"><span className="font-semibold">{l.nombre}</span><span className="block text-[11px] text-slate-400">{l.sku}{l.unidades_pendientes > 0 && l.unidades_confirmadas != null ? ` · ${MOTIVOS[l.motivo_ajuste] ?? ''}` : ''}</span></td>
                <td className="px-2 text-right">{l.unidades_solicitadas}</td>
                <td className={`px-2 text-right ${l.unidades_confirmadas != null && l.unidades_pendientes > 0 ? 'font-semibold text-amber-600' : ''}`}>{l.unidades_confirmadas ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {p.observaciones && <p className="text-xs text-slate-500">Nota: {p.observaciones}</p>}

      {puedeDerivar && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 dark:border-teal-900 dark:bg-teal-950/30">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-teal-900 dark:text-teal-200"><CornerDownRight className="h-4 w-4" />Quedaron {pendientes.reduce((a, l) => a + l.unidades_pendientes, 0)} unidades sin despachar</p>
          <div className="flex flex-wrap gap-2">
            <select value={destino} onChange={(e) => setDestino(e.target.value)} aria-label="Droguería destino" className={`${estiloInput} flex-1`}>
              <option value="">Enviar lo pendiente a…</option>
              {otrasDroguerias.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
            <Boton variante="primario" disabled={!destino} onClick={() => onRerutear(destino)}>Re-rutear</Boton>
          </div>
        </div>
      )}
    </div>
  );
}
