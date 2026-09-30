import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, Lock, RefreshCw } from 'lucide-react';
import type { Usuario } from '../types/pharmacy';
import type { LocalCliente, LocalDetalle, LocalDrogueria, LocalMapCliente, LocalMapProducto, LocalPedido, LocalProducto, MotivoAjuste } from '../offline/types';
import { obtenerDb } from '../offline/db';
import { sincronizarYa } from '../offline/motor';
import { getSupabaseClient } from '../services/supabaseClient';
import { generarArchivoDrogueria } from '../services/exportacionDrogueria';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { Sheet } from '../components/capture/Sheet';
import { Boton, Etiqueta, PageHeader, Segmentado, Tarjeta, Vacio, estiloInput, useAviso } from '../components/ui/kit';
import { descargarTexto, detallesPorPedido, diasDesde, ESTADOS_ETIQUETA, unidadesDePedido } from './logica';
import { aplicarConfirmacionLocal, estadoTrasConfirmar, validarConfirmaciones } from './mesa';
import type { Confirmacion } from './mesa';
import { useClientes, useDetalles, useDroguerias, useMapClientes, useMapProductos, usePedidos, useProductos, useUsuariosNube } from './useDatos';

type Cola = 'cola' | 'revision' | 'hechos';
const EN_COLA = ['enviado_teletransferencia', 'en_proceso'];
const HECHOS = ['procesado_parcial', 'procesado_total', 'facturado', 'rechazado'];
const enCola = (c: Cola, e: string) => (c === 'cola' ? EN_COLA.includes(e) : c === 'revision' ? e === 'en_revision' : HECHOS.includes(e));

const MOTIVOS: { id: MotivoAjuste; texto: string }[] = [
  { id: 'quiebre_stock_drogueria', texto: 'Sin stock en la droguería' },
  { id: 'limite_credito', texto: 'Límite de crédito' },
  { id: 'producto_descontinuado', texto: 'Producto descontinuado' },
  { id: 'ajuste_comercial', texto: 'Ajuste comercial' },
  { id: 'otro', texto: 'Otro' },
];

/** Bloqueo del pedido mientras la mesa lo trabaja (evita que dos personas lo procesen a la vez). Se renueva cada 50 s. */
function useBloqueo(pedidoId: string | null, activo: boolean) {
  const [estado, setEstado] = useState<{ ok: boolean; nombre?: string; error?: string } | null>(null);
  useEffect(() => {
    const sb = getSupabaseClient();
    if (!pedidoId || !activo) return setEstado(null);
    if (!sb) return setEstado({ ok: true }); // demostración: sin servidor no hay con quién competir
    let vivo = true;
    const tomar = async () => {
      const { data, error } = await sb.rpc('tomar_pedido', { p_pedido: pedidoId });
      if (!vivo) return;
      if (error) setEstado({ ok: false, error: error.message });
      else setEstado(data?.ok ? { ok: true } : { ok: false, nombre: data?.nombre });
    };
    void tomar();
    const t = setInterval(() => void tomar(), 50_000);
    return () => {
      vivo = false;
      clearInterval(t);
      void sb.rpc('liberar_pedido', { p_pedido: pedidoId });
    };
  }, [pedidoId, activo]);
  return estado;
}

/** Mesa de transferencias: recibir el pedido, descargar el archivo de la droguería y registrar lo que despachó. */
export function PorProcesarVista({ usuario, irATab }: { usuario: Usuario; irATab: (t: string) => void }) {
  const pedidos = usePedidos();
  const detalles = useDetalles();
  const clientes = useClientes();
  const droguerias = useDroguerias();
  const productos = useProductos();
  const mapProductos = useMapProductos();
  const mapClientes = useMapClientes();
  const { usuarios } = useUsuariosNube();
  const grande = useMediaQuery('(min-width: 1024px)');
  const [cola, setCola] = useState<Cola>('cola');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [actualizando, setActualizando] = useState(false);
  const { mostrar, nodo } = useAviso();

  const porPedido = useMemo(() => detallesPorPedido(detalles), [detalles]);
  const cuentas = useMemo(() => ({ cola: pedidos.filter((p) => enCola('cola', p.estado)).length, revision: pedidos.filter((p) => enCola('revision', p.estado)).length, hechos: pedidos.filter((p) => enCola('hechos', p.estado)).length }), [pedidos]);
  const lista = useMemo(
    () => pedidos.filter((p) => enCola(cola, p.estado)).sort((a, b) => (cola === 'hechos' ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at))).slice(0, 150),
    [pedidos, cola]
  );
  const actual = abierto ? pedidos.find((p) => p.id === abierto) : undefined;
  const cliente = (id: string) => clientes.find((c) => c.id === id);
  const vendedor = (id: string) => usuarios.find((u) => u.id === id)?.nombre_completo ?? '';

  const actualizar = async () => {
    setActualizando(true);
    try {
      await sincronizarYa();
    } finally {
      setActualizando(false);
    }
  };

  const detalle = actual && (
    <Procesar
      key={actual.id}
      pedido={actual}
      lineas={porPedido.get(actual.id) ?? []}
      cliente={cliente(actual.cliente_id)}
      drogueria={droguerias.find((d) => d.id === actual.drogueria_id)}
      productos={productos}
      mapProductos={mapProductos}
      mapClientes={mapClientes}
      vendedor={vendedor(actual.vendedor_id)}
      esAdmin={usuario.rol === 'admin'}
      irATab={irATab}
      onAviso={mostrar}
      onListo={() => { setAbierto(null); void actualizar(); }}
    />
  );

  return (
    <div>
      <PageHeader
        titulo="Por procesar"
        descripcion="Toma un pedido, descarga el archivo de la droguería y registra lo que despachó."
        acciones={<Boton icono={RefreshCw} onClick={actualizar} disabled={actualizando}>{actualizando ? 'Actualizando…' : 'Actualizar'}</Boton>}
      />
      {nodo}
      <Segmentado opciones={[{ id: 'cola', texto: 'Por procesar', cuenta: cuentas.cola }, { id: 'revision', texto: 'En revisión', cuenta: cuentas.revision }, { id: 'hechos', texto: 'Procesados', cuenta: cuentas.hechos }]} valor={cola} onChange={(c) => { setCola(c); setAbierto(null); }} />

      <div className={grande ? 'grid grid-cols-[minmax(300px,380px)_1fr] items-start gap-3' : ''}>
        <Tarjeta className="!p-0">
          {lista.length === 0 ? (
            <Vacio icono={CheckCircle2} titulo={cola === 'cola' ? 'No hay pedidos esperando' : cola === 'revision' ? 'Nada en revisión' : 'Aún no hay pedidos procesados'} texto={cola === 'cola' ? 'Cuando un vendedor envíe un pedido, aparecerá aquí.' : undefined} />
          ) : (
            <ul className="max-h-[calc(100dvh-14rem)] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {lista.map((p) => {
                const u = unidadesDePedido(porPedido.get(p.id) ?? []);
                const e = ESTADOS_ETIQUETA[p.estado];
                const espera = diasDesde(p.created_at);
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => setAbierto(p.id)} className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 ${abierto === p.id ? 'bg-marca-50 dark:bg-marca-950/30' : ''}`}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{cliente(p.cliente_id)?.nombre_comercial ?? 'Farmacia'}</p>
                        <p className="truncate text-xs text-slate-500">{p.correlativo} · {droguerias.find((d) => d.id === p.drogueria_id)?.nombre ?? ''} · {u.solicitadas} uds</p>
                        <p className="truncate text-xs text-slate-400">{vendedor(p.vendedor_id) || 'Vendedor'} · {espera === 0 ? 'hoy' : `hace ${espera} d`}</p>
                      </div>
                      <Etiqueta tono={e.tono}>{e.texto}</Etiqueta>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Tarjeta>
        {grande && (detalle ? <Tarjeta>{detalle}</Tarjeta> : <Tarjeta><Vacio titulo="Elige un pedido" texto="Verás sus líneas, el archivo para la droguería y los botones para confirmar." /></Tarjeta>)}
      </div>

      {!grande && (
        <Sheet abierto={!!actual} titulo={actual?.correlativo ?? ''} onCerrar={() => setAbierto(null)} ancho="md:max-w-2xl">
          {detalle}
        </Sheet>
      )}
    </div>
  );
}

function Procesar({
  pedido: p, lineas, cliente, drogueria, productos, mapProductos, mapClientes, vendedor, esAdmin, irATab, onAviso, onListo,
}: {
  pedido: LocalPedido;
  lineas: LocalDetalle[];
  cliente?: LocalCliente;
  drogueria?: LocalDrogueria;
  productos: LocalProducto[];
  mapProductos: LocalMapProducto[];
  mapClientes: LocalMapCliente[];
  vendedor: string;
  esAdmin: boolean;
  irATab: (t: string) => void;
  onAviso: (a: { tipo: 'ok' | 'error'; texto: string }) => void;
  onListo: () => void;
}) {
  const procesable = ['enviado_teletransferencia', 'en_revision', 'en_proceso'].includes(p.estado);
  const bloqueo = useBloqueo(p.id, procesable);
  const puedeEditar = procesable && bloqueo?.ok === true;
  const [conf, setConf] = useState<Record<string, string>>(() => Object.fromEntries(lineas.map((l) => [l.id, String(l.unidades_confirmadas ?? l.unidades_solicitadas)])));
  const [motivos, setMotivos] = useState<Record<string, MotivoAjuste>>({});
  const [factura, setFactura] = useState(p.numero_factura ?? '');
  const [enviando, setEnviando] = useState(false);
  const nombreProducto = (id: string) => productos.find((x) => x.id === id);

  const archivo = useMemo(
    () => (cliente && drogueria ? generarArchivoDrogueria({ pedido: p, detalles: lineas, cliente, drogueria, productos, mapProductos, mapClientes }, { cantidad: 'auto' }) : null),
    [p, lineas, cliente, drogueria, productos, mapProductos, mapClientes]
  );

  const confirmaciones = (): Confirmacion[] =>
    lineas.map((l) => ({ detalle_id: l.id, unidades_confirmadas: Number(conf[l.id] === '' ? NaN : conf[l.id]), motivo: motivos[l.id] ?? 'quiebre_stock_drogueria' }));
  const previsto = useMemo(() => {
    const c = confirmaciones();
    return c.some((x) => Number.isNaN(x.unidades_confirmadas)) ? null : estadoTrasConfirmar(lineas, c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conf, lineas]);

  const enviar = async (c: Confirmacion[]) => {
    const problema = validarConfirmaciones(lineas, c);
    if (problema) return onAviso({ tipo: 'error', texto: problema });
    setEnviando(true);
    try {
      const sb = getSupabaseClient();
      if (sb) {
        const { data, error } = await sb.rpc('confirmar_pedido', {
          p_pedido: p.id,
          p_confirmaciones: c.map((x) => ({ detalle_id: x.detalle_id, unidades_confirmadas: x.unidades_confirmadas, motivo: x.motivo })),
          p_numero_factura: factura.trim() || null,
        });
        if (error) throw new Error(error.message);
        onAviso({ tipo: 'ok', texto: `${p.correlativo}: ${ESTADOS_ETIQUETA[(data as { estado: LocalPedido['estado'] }).estado].texto.toLowerCase()}.` });
      } else {
        const db = obtenerDb();
        const nuevas = aplicarConfirmacionLocal(lineas, c);
        const estado = estadoTrasConfirmar(lineas, c);
        await db.transaction('rw', db.detalles, db.pedidos, async () => {
          await db.detalles.bulkPut(nuevas);
          await db.pedidos.update(p.id, { estado, numero_factura: factura.trim() || null, updated_at: new Date().toISOString() });
        });
        onAviso({ tipo: 'ok', texto: `${p.correlativo}: ${ESTADOS_ETIQUETA[estado].texto.toLowerCase()} (demostración).` });
      }
      onListo();
    } catch (e) {
      onAviso({ tipo: 'error', texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setEnviando(false);
    }
  };

  const descargar = () => {
    if (archivo?.ok) descargarTexto(archivo.nombre_archivo, archivo.bytes, archivo.mime);
  };

  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold">{cliente?.nombre_comercial ?? 'Farmacia'}</h2>
          <Etiqueta tono={ESTADOS_ETIQUETA[p.estado].tono}>{ESTADOS_ETIQUETA[p.estado].texto}</Etiqueta>
        </div>
        <p className="text-xs text-slate-500">
          {p.correlativo} · {drogueria?.nombre ?? 'Droguería'} · {vendedor || 'Vendedor'} · {new Date(p.created_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}
        </p>
        {p.observaciones && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Nota del vendedor: {p.observaciones}</p>}
      </div>

      {procesable && bloqueo && !bloqueo.ok && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          {bloqueo.error ?? `${bloqueo.nombre ?? 'Otra persona'} lo está procesando ahora. Podrás tomarlo cuando termine.`}
        </p>
      )}

      {/* Archivo para la droguería */}
      <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Archivo para {drogueria?.nombre ?? 'la droguería'}</p>
          <Boton variante="primario" icono={Download} disabled={!archivo?.ok} onClick={descargar}>{archivo?.ok ? `Descargar ${archivo.nombre_archivo}` : 'Descargar'}</Boton>
        </div>
        {archivo && !archivo.ok && (
          <ul className="mt-2 space-y-1 text-xs text-rose-700 dark:text-rose-300">
            {archivo.errores.map((e, i) => <li key={i}>• {e.mensaje}</li>)}
            {esAdmin && <li><button type="button" className="font-semibold underline" onClick={() => irATab('datos')}>Ir a Datos para completar la homologación</button></li>}
          </ul>
        )}
        {archivo?.ok && archivo.advertencias.map((a, i) => <p key={i} className="mt-1 text-xs text-amber-700 dark:text-amber-300">{a}</p>)}
      </div>

      {/* Líneas */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/60">
            <tr><th className="px-2.5 py-1.5">Producto</th><th className="px-2 text-right">Pedidas</th><th className="w-24 px-2 text-right">Confirmadas</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {lineas.map((l) => {
              const valor = conf[l.id] ?? '';
              const menos = Number(valor) < l.unidades_solicitadas;
              return (
                <tr key={l.id}>
                  <td className="px-2.5 py-1.5">
                    <span className="font-semibold">{nombreProducto(l.producto_id)?.nombre_comercial ?? 'Producto'}</span>
                    <span className="block text-xs text-slate-400">{nombreProducto(l.producto_id)?.sku}</span>
                    {puedeEditar && menos && valor !== '' && (
                      <select value={motivos[l.id] ?? 'quiebre_stock_drogueria'} onChange={(e) => setMotivos((m) => ({ ...m, [l.id]: e.target.value as MotivoAjuste }))} aria-label="Motivo" className="mt-1 rounded-lg border border-slate-300 bg-white px-1.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-900">
                        {MOTIVOS.map((m) => <option key={m.id} value={m.id}>{m.texto}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="px-2 text-right">{l.unidades_solicitadas}</td>
                  <td className="px-2 text-right">
                    {puedeEditar ? (
                      <input inputMode="numeric" value={valor} onChange={(e) => setConf((c) => ({ ...c, [l.id]: e.target.value.replace(/\D/g, '') }))} aria-label={`Confirmadas de ${nombreProducto(l.producto_id)?.nombre_comercial}`} className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-sm dark:border-slate-700 dark:bg-slate-900" />
                    ) : (
                      <span className={l.unidades_confirmadas != null && l.unidades_pendientes > 0 ? 'font-semibold text-amber-600' : ''}>{l.unidades_confirmadas ?? '—'}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {puedeEditar && (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Número de factura o despacho (opcional)
            <input value={factura} onChange={(e) => setFactura(e.target.value)} className={`${estiloInput} mt-1`} />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Boton variante="primario" disabled={enviando || previsto === null} onClick={() => void enviar(confirmaciones())}>
              {enviando ? 'Guardando…' : previsto ? `Confirmar · quedará ${ESTADOS_ETIQUETA[previsto].texto.toLowerCase()}` : 'Confirmar'}
            </Boton>
            <Boton
              variante="peligro"
              disabled={enviando}
              onClick={() => window.confirm('¿Rechazar el pedido completo? Se registrará que la droguería no despachó nada.') && void enviar(lineas.map((l) => ({ detalle_id: l.id, unidades_confirmadas: 0, motivo: 'otro' })))}
            >
              Rechazar
            </Boton>
          </div>
        </div>
      )}
    </div>
  );
}
