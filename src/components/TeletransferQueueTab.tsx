import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PedidoCabecera,
  PedidoDetalle,
  Cliente,
  Drogueria,
  Producto,
  MotivoAjuste,
  EstadoPedido,
} from '../types/pharmacy';
import { generarCsvDrogueria, descargarArchivoCsv } from '../services/csvExportEngine';
import {
  CheckCircle2,
  Download,
  Search,
  Send,
  FileCheck2,
  Check,
  PackageCheck,
  ChevronLeft,
  ListChecks,
} from 'lucide-react';

interface TeletransferQueueTabProps {
  pedidosCabecera: PedidoCabecera[];
  pedidosDetalle: PedidoDetalle[];
  clientes: Cliente[];
  droguerias: Drogueria[];
  productos: Producto[];
  onActualizarDetalle: (detalleId: string, cantidadConfirmada: number, motivoAjuste: MotivoAjuste, observaciones?: string) => void;
  onCambiarEstadoPedido: (pedidoId: string, nuevoEstado: EstadoPedido, numeroFactura?: string) => void;
}

const ESTADOS_BADGE: Record<string, { texto: string; clases: string }> = {
  facturado: { texto: 'Facturado', clases: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800' },
  en_proceso: { texto: 'En Droguería', clases: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800' },
  enviado_teletransferencia: { texto: 'Por Procesar', clases: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800' },
  procesado_total: { texto: 'Despachado Total', clases: 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800' },
  procesado_parcial: { texto: 'Despacho Parcial', clases: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800' },
};

const EstadoBadge: React.FC<{ estado: EstadoPedido }> = ({ estado }) => {
  const badge = ESTADOS_BADGE[estado] ?? {
    texto: estado,
    clases: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  };
  return (
    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold border ${badge.clases}`}>
      {badge.texto}
    </span>
  );
};

const FILTROS_ESTADO: { valor: string; etiqueta: string }[] = [
  { valor: 'enviado_teletransferencia', etiqueta: 'Por procesar' },
  { valor: 'en_proceso', etiqueta: 'En droguería' },
  { valor: 'facturado', etiqueta: 'Facturados' },
  { valor: 'todos', etiqueta: 'Todos' },
];

const nombreCliente = (c?: Cliente) =>
  c?.nombre_fantasia || c?.nombre_comercial || c?.razon_social || 'Farmacia desconocida';

// Columnas de la conciliación: SKU y Precio se agregan solo en pantallas muy anchas (PC del transferencista).
const GRID_LINEA =
  'md:grid md:items-center md:gap-3 md:grid-cols-[minmax(0,1fr)_4.5rem_6rem_5.5rem_8.5rem] 2xl:grid-cols-[6rem_minmax(0,1fr)_4.5rem_6rem_5rem_5.5rem_8.5rem]';

const campoBase =
  'rounded-lg border focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-900 dark:bg-slate-800 dark:text-white';

export const TeletransferQueueTab: React.FC<TeletransferQueueTabProps> = ({
  pedidosCabecera,
  pedidosDetalle,
  clientes,
  droguerias,
  productos,
  onActualizarDetalle,
  onCambiarEstadoPedido,
}) => {
  const [pedidoSeleccionadoId, setPedidoSeleccionadoId] = useState<string>('');
  const [vistaDetalle, setVistaDetalle] = useState(false); // solo aplica bajo lg: lista <-> detalle
  const [filtroDrogueria, setFiltroDrogueria] = useState<string>('all');
  const [filtroEstado, setFiltroEstado] = useState<string>('enviado_teletransferencia');
  const [busqueda, setBusqueda] = useState<string>('');
  const [numeroFactura, setNumeroFactura] = useState('');
  const [mensajeToast, setMensajeToast] = useState<string | null>(null);
  const temporizadorToast = useRef<number | undefined>(undefined);
  const conciliacionRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => window.clearTimeout(temporizadorToast.current), []);

  const mostrarToast = useCallback((texto: string) => {
    setMensajeToast(texto);
    window.clearTimeout(temporizadorToast.current);
    temporizadorToast.current = window.setTimeout(() => setMensajeToast(null), 3500);
  }, []);

  // Índices por id: evitan un .find() sobre todos los clientes/droguerías por cada pedido dibujado.
  const productosMap = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const clientesMap = useMemo(() => {
    const mapa = new Map<string, Cliente>();
    clientes.forEach((c) => {
      mapa.set(c.id, c);
      if (c.ident01) mapa.set(c.ident01, c);
    });
    return mapa;
  }, [clientes]);
  const drogueriasMap = useMemo(() => new Map(droguerias.map((d) => [d.id, d])), [droguerias]);

  const pedidosBase = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return pedidosCabecera.filter((ped) => {
      if (filtroDrogueria !== 'all' && ped.drogueria_id !== filtroDrogueria) return false;
      if (!q) return true;
      const cli = clientesMap.get(ped.cliente_id);
      return (
        (ped.numero_pedido || '').toLowerCase().includes(q) ||
        nombreCliente(cli).toLowerCase().includes(q) ||
        (cli?.rif || '').toLowerCase().includes(q)
      );
    });
  }, [pedidosCabecera, filtroDrogueria, busqueda, clientesMap]);

  const conteos = useMemo(() => {
    const c: Record<string, number> = { todos: pedidosBase.length };
    pedidosBase.forEach((p) => {
      c[p.estado] = (c[p.estado] ?? 0) + 1;
    });
    return c;
  }, [pedidosBase]);

  const pedidosFiltrados = useMemo(
    () => (filtroEstado === 'todos' ? pedidosBase : pedidosBase.filter((p) => p.estado === filtroEstado)),
    [pedidosBase, filtroEstado]
  );

  // El detalle siempre corresponde a un pedido visible en la lista (antes caía en un pedido oculto por los filtros).
  const pedidoActual = useMemo(
    () => pedidosFiltrados.find((p) => p.id === pedidoSeleccionadoId) ?? pedidosFiltrados[0],
    [pedidosFiltrados, pedidoSeleccionadoId]
  );
  const clienteActual = pedidoActual ? clientesMap.get(pedidoActual.cliente_id) : undefined;
  const drogueriaActual = pedidoActual ? drogueriasMap.get(pedidoActual.drogueria_id) : undefined;

  const detallesActuales = useMemo(
    () => (pedidoActual ? pedidosDetalle.filter((d) => d.pedido_id === pedidoActual.id) : []),
    [pedidosDetalle, pedidoActual]
  );

  useEffect(() => {
    setNumeroFactura(pedidoActual?.numero_factura ?? '');
  }, [pedidoActual?.id, pedidoActual?.numero_factura]);

  const totales = useMemo(() => {
    let solicitadas = 0;
    let confirmadas = 0;
    let monto = 0;
    detallesActuales.forEach((d) => {
      solicitadas += d.cantidad_solicitada;
      confirmadas += d.cantidad_confirmada;
      const precio = d.precio_unitario || productosMap.get(d.producto_id)?.precio_lista || 1;
      monto += d.cantidad_confirmada * precio * (1 - (d.descuento_porcentaje || 0) / 100);
    });
    return {
      solicitadas,
      confirmadas,
      monto,
      fillRate: solicitadas > 0 ? Number(((confirmadas / solicitadas) * 100).toFixed(1)) : 100,
    };
  }, [detallesActuales, productosMap]);

  const seleccionarPedido = (id: string) => {
    setPedidoSeleccionadoId(id);
    setVistaDetalle(true);
    window.scrollTo({ top: 0 });
  };

  const handleDescargarCsv = () => {
    if (!pedidoActual || !drogueriaActual || !clienteActual) return;
    descargarArchivoCsv(generarCsvDrogueria(pedidoActual, detallesActuales, clienteActual, drogueriaActual, productosMap));
    mostrarToast(`CSV descargado con el layout de ${drogueriaActual.nombre_drogueria}`);
  };

  const handleMarcarEnviado = () => {
    if (!pedidoActual) return;
    onCambiarEstadoPedido(pedidoActual.id, 'en_proceso');
    mostrarToast(`Pedido ${pedidoActual.numero_pedido} marcado como enviado a droguería.`);
  };

  const handleFacturarCompleto = () => {
    detallesActuales.forEach((d) => {
      if (d.cantidad_confirmada !== d.cantidad_solicitada) {
        onActualizarDetalle(d.id, d.cantidad_solicitada, 'sin_quiebre', d.observaciones_linea);
      }
    });
    mostrarToast('Todas las líneas quedaron facturadas completas.');
  };

  const handleConfirmarFacturacion = () => {
    if (!pedidoActual) return;
    onCambiarEstadoPedido(pedidoActual.id, 'facturado', numeroFactura.trim() || undefined);
    mostrarToast(`Pedido ${pedidoActual.numero_pedido} confirmado como FACTURADO.`);
  };

  const handleCambiarCantidad = (det: PedidoDetalle, valorCrudo: string) => {
    const tope = det.cantidad_solicitada * 2;
    const cantidad = Math.min(Math.max(parseInt(valorCrudo, 10) || 0, 0), tope);
    const motivo: MotivoAjuste =
      cantidad >= det.cantidad_solicitada
        ? 'sin_quiebre'
        : det.motivo_ajuste === 'sin_quiebre'
        ? 'quiebre_stock_drogueria'
        : det.motivo_ajuste;
    onActualizarDetalle(det.id, cantidad, motivo, det.observaciones_linea);
  };

  // Teclado (PC): Enter / ↓ pasa a la siguiente cantidad, ↑ a la anterior, para conciliar sin usar el mouse.
  const moverFoco = (e: React.KeyboardEvent<HTMLInputElement>, paso: 1 | -1) => {
    const campos = Array.from(
      conciliacionRef.current?.querySelectorAll<HTMLInputElement>('input[data-cantidad]') ?? []
    );
    const destino = campos[campos.indexOf(e.currentTarget) + paso];
    if (destino) {
      e.preventDefault();
      destino.focus();
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {mensajeToast && (
        <div
          role="status"
          aria-live="polite"
          className="animate-in fixed top-16 left-3 right-3 md:left-auto md:right-8 md:max-w-md bg-slate-900 text-white py-3 px-4 rounded-xl shadow-xl flex items-center gap-3 z-50"
        >
          <CheckCircle2 className="w-5 h-5 text-teal-400 shrink-0" />
          <span className="text-sm font-medium">{mensajeToast}</span>
        </div>
      )}

      {/* Título y filtros */}
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Teletransferencias
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Descarga el CSV por droguería y concilia las unidades facturadas.
          </p>
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <div className="relative flex-1 md:max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por N° de pedido, farmacia o RIF"
              aria-label="Buscar pedidos"
              className={`${campoBase} w-full min-h-11 pl-9 pr-3 text-sm border-slate-200 dark:border-slate-700`}
            />
          </div>
          <select
            value={filtroDrogueria}
            onChange={(e) => setFiltroDrogueria(e.target.value)}
            aria-label="Filtrar por droguería"
            className={`${campoBase} min-h-11 px-3 text-sm font-semibold border-slate-200 dark:border-slate-700`}
          >
            <option value="all">Todas las droguerías</option>
            {droguerias.map((d) => (
              <option key={d.id} value={d.id}>{d.nombre_drogueria}</option>
            ))}
          </select>
        </div>

        <div role="tablist" aria-label="Estado del pedido" className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-3.5 px-3.5 sm:mx-0 sm:px-0">
          {FILTROS_ESTADO.map((f) => {
            const activo = filtroEstado === f.valor;
            return (
              <button
                key={f.valor}
                type="button"
                role="tab"
                aria-selected={activo}
                onClick={() => setFiltroEstado(f.valor)}
                className={`shrink-0 min-h-10 px-3.5 rounded-full text-xs font-bold border transition-colors ${
                  activo
                    ? 'bg-teal-600 border-teal-600 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {f.etiqueta}
                <span className={`ml-1.5 font-mono ${activo ? 'text-teal-100' : 'text-slate-400'}`}>
                  {conteos[f.valor] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)] gap-4 lg:gap-5 items-start">
        {/* Lista de pedidos */}
        <section
          aria-label="Pedidos recibidos"
          className={`${vistaDetalle ? 'hidden lg:flex' : 'flex'} flex-col gap-2 lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100dvh-6rem)]`}
        >
          <span className="px-1 text-xs font-bold uppercase tracking-wider text-slate-400">
            Pedidos ({pedidosFiltrados.length})
          </span>
          <div className="flex flex-col gap-2 lg:overflow-y-auto lg:pr-1">
            {pedidosFiltrados.length === 0 ? (
              <div className="p-8 text-center rounded-2xl border border-slate-200 bg-white text-slate-400 text-sm dark:bg-slate-900 dark:border-slate-800">
                No hay pedidos con los filtros aplicados.
              </div>
            ) : (
              pedidosFiltrados.map((ped) => {
                const seleccionado = ped.id === pedidoActual?.id;
                return (
                  <button
                    key={ped.id}
                    type="button"
                    onClick={() => seleccionarPedido(ped.id)}
                    aria-current={seleccionado ? 'true' : undefined}
                    className={`cv-auto w-full text-left p-3.5 rounded-xl border transition-colors ${
                      seleccionado
                        ? 'border-teal-600 bg-teal-50 ring-1 ring-teal-500 dark:bg-teal-950/30'
                        : 'bg-white border-slate-200 hover:border-slate-300 dark:bg-slate-900 dark:border-slate-800 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-mono text-xs font-bold text-teal-700 dark:text-teal-400">{ped.numero_pedido}</span>
                      <EstadoBadge estado={ped.estado} />
                    </div>
                    <p className="font-semibold text-sm leading-snug truncate text-slate-900 dark:text-white">
                      {nombreCliente(clientesMap.get(ped.cliente_id))}
                    </p>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mt-1.5">
                      <span className="truncate">{drogueriasMap.get(ped.drogueria_id)?.nombre_drogueria}</span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                        ${ped.total_solicitado.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-0.5">
                      <span>Eq. {ped.equipo_origen}</span>
                      <span>{new Date(ped.fecha_pedido).toLocaleDateString()}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Detalle del pedido */}
        {pedidoActual ? (
          <section aria-label="Detalle del pedido" className={`${vistaDetalle ? 'flex' : 'hidden lg:flex'} flex-col gap-4 min-w-0`}>
            <button
              type="button"
              onClick={() => setVistaDetalle(false)}
              className="lg:hidden self-start min-h-11 -mb-1 inline-flex items-center gap-1 pr-3 text-sm font-semibold text-teal-700 dark:text-teal-400"
            >
              <ChevronLeft className="w-5 h-5" />
              Volver a pedidos
            </button>

            <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 space-y-4">
              <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-mono text-sm font-bold text-teal-700 dark:text-teal-400">{pedidoActual.numero_pedido}</span>
                    <EstadoBadge estado={pedidoActual.estado} />
                  </div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white break-words">
                    {nombreCliente(clienteActual)}
                    <span className="font-mono text-xs font-medium text-slate-500"> · {clienteActual?.rif || 'Sin RIF'}</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Droguería: <strong className="text-slate-700 dark:text-slate-200">{drogueriaActual?.nombre_drogueria}</strong> · Equipo {pedidoActual.equipo_origen}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:flex xl:flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDescargarCsv}
                    className="min-h-11 inline-flex items-center justify-center gap-2 px-4 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-500 text-white shadow-sm"
                    title={`Descargar archivo con el layout de ${drogueriaActual?.nombre_drogueria}`}
                  >
                    <Download className="w-4 h-4" />
                    Descargar CSV
                  </button>
                  {pedidoActual.estado === 'enviado_teletransferencia' && (
                    <button
                      type="button"
                      onClick={handleMarcarEnviado}
                      className="min-h-11 inline-flex items-center justify-center gap-2 px-4 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white"
                    >
                      <Send className="w-4 h-4" />
                      Marcar enviado
                    </button>
                  )}
                </div>
              </div>

              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                {[
                  { t: 'Solicitadas', v: `${totales.solicitadas} uds`, c: 'text-slate-800 dark:text-slate-100' },
                  { t: 'Facturadas', v: `${totales.confirmadas} uds`, c: 'text-teal-700 dark:text-teal-400' },
                  { t: 'Monto liquidado', v: `$${totales.monto.toFixed(2)}`, c: 'text-slate-800 dark:text-slate-100' },
                  {
                    t: 'Fill-rate',
                    v: `${totales.fillRate}%`,
                    c: totales.fillRate >= 90 ? 'text-emerald-600' : totales.fillRate >= 70 ? 'text-amber-500' : 'text-rose-500',
                  },
                ].map((m) => (
                  <div key={m.t} className="p-3 rounded-xl border border-slate-100 bg-slate-50 dark:bg-slate-800/40 dark:border-slate-800">
                    <dt className="text-slate-500 text-[10px] uppercase font-bold">{m.t}</dt>
                    <dd className={`text-base font-bold font-mono ${m.c}`}>{m.v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Conciliación renglón por renglón */}
            <div
              ref={conciliacionRef}
              className="rounded-2xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800"
            >
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                    <PackageCheck className="w-4 h-4 text-teal-600" />
                    Conciliación de unidades facturadas
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Ingresa lo que facturó la droguería.
                    <span className="hidden md:inline"> Enter o ↓ avanza a la siguiente línea.</span>
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={numeroFactura}
                    onChange={(e) => setNumeroFactura(e.target.value)}
                    placeholder="N° de factura (ej. FAC-89302)"
                    aria-label="Número de factura de la droguería"
                    className={`${campoBase} min-h-11 px-3 text-sm font-mono border-slate-300 dark:border-slate-700 sm:w-56`}
                  />
                  <button
                    type="button"
                    onClick={handleFacturarCompleto}
                    className="min-h-11 inline-flex items-center justify-center gap-2 px-4 rounded-xl text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100"
                  >
                    <ListChecks className="w-4 h-4 text-teal-600" />
                    Facturar todo completo
                  </button>
                </div>
              </div>

              <div role="table" aria-label="Líneas del pedido">
                <div
                  role="row"
                  className={`${GRID_LINEA} hidden px-4 py-2.5 text-[11px] uppercase tracking-wider font-semibold bg-slate-50 text-slate-500 border-b border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-800`}
                >
                  <span role="columnheader" className="hidden 2xl:block">SKU</span>
                  <span role="columnheader">Medicamento</span>
                  <span role="columnheader" className="text-right">Solic.</span>
                  <span role="columnheader" className="text-center">Facturado</span>
                  <span role="columnheader" className="hidden 2xl:block text-right">Precio</span>
                  <span role="columnheader" className="text-right">Subtotal</span>
                  <span role="columnheader">Estado</span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {detallesActuales.map((det) => {
                    const prod = productosMap.get(det.producto_id);
                    const hayDiferencia = det.cantidad_confirmada < det.cantidad_solicitada;
                    return (
                      <div
                        key={det.id}
                        role="row"
                        className={`${GRID_LINEA} cv-auto p-4 md:px-4 md:py-3 flex flex-col gap-3 ${
                          hayDiferencia ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''
                        }`}
                      >
                        <span role="cell" className="hidden 2xl:block font-mono text-xs text-slate-500">{prod?.sku}</span>

                        <div role="cell" className="min-w-0">
                          <p className="font-bold text-sm text-slate-900 dark:text-white">{prod?.nombre_comercial || 'Producto'}</p>
                          <span className="text-xs text-slate-500">
                            <span className="2xl:hidden font-mono">{prod?.sku} · </span>
                            {prod?.presentacion} · {prod?.laboratorio}
                          </span>
                        </div>

                        <div role="cell" className="flex items-center justify-between md:block">
                          <span className="md:hidden text-xs text-slate-500 font-semibold">Solicitado</span>
                          <span className="md:block md:text-right font-mono font-semibold text-sm text-slate-700 dark:text-slate-300">
                            {det.cantidad_solicitada}
                          </span>
                        </div>

                        <div role="cell" className="flex items-center justify-between md:justify-center">
                          <label htmlFor={`cant-${det.id}`} className="md:hidden text-xs text-slate-500 font-semibold">Facturado</label>
                          <input
                            id={`cant-${det.id}`}
                            data-cantidad
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={det.cantidad_solicitada * 2}
                            value={det.cantidad_confirmada}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => handleCambiarCantidad(det, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === 'ArrowDown') moverFoco(e, 1);
                              else if (e.key === 'ArrowUp') moverFoco(e, -1);
                            }}
                            className={`${campoBase} w-24 md:w-full min-h-11 md:min-h-9 px-2 text-center font-mono font-bold text-base md:text-sm ${
                              hayDiferencia
                                ? 'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                                : 'border-slate-300 dark:border-slate-700 text-teal-700 dark:text-teal-400'
                            }`}
                          />
                        </div>

                        <span role="cell" className="hidden 2xl:block text-right font-mono text-sm text-slate-600 dark:text-slate-400">
                          ${det.precio_unitario.toFixed(2)}
                        </span>

                        <div role="cell" className="flex items-center justify-between md:block">
                          <span className="md:hidden text-xs text-slate-500 font-semibold">Subtotal</span>
                          <span className="md:block md:text-right font-mono font-bold text-sm text-slate-900 dark:text-white">
                            ${det.subtotal_confirmado.toFixed(2)}
                          </span>
                        </div>

                        <div role="cell">
                          {hayDiferencia ? (
                            <select
                              value={det.motivo_ajuste}
                              aria-label="Motivo del quiebre"
                              onChange={(e) =>
                                onActualizarDetalle(det.id, det.cantidad_confirmada, e.target.value as MotivoAjuste, det.observaciones_linea)
                              }
                              className={`${campoBase} w-full min-h-11 md:min-h-9 px-2 text-sm border-amber-300 dark:border-amber-700`}
                            >
                              <option value="quiebre_stock_drogueria">Quiebre almacén</option>
                              <option value="limite_credito">Límite crédito</option>
                              <option value="producto_descontinuado">Descontinuado</option>
                              <option value="ajuste_comercial">Ajuste comercial</option>
                              <option value="otro">Otro</option>
                            </select>
                          ) : (
                            <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" /> Completo
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Barra de cierre siempre visible al hacer scroll (por encima de la barra inferior en móvil) */}
              <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-0 z-10 p-3 sm:p-4 rounded-b-2xl bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] flex items-center justify-between gap-3">
                <div className="text-xs text-slate-500 leading-snug">
                  <span className="block">
                    Facturado: <strong className="font-mono text-slate-800 dark:text-white">{totales.confirmadas} uds</strong>
                  </span>
                  <strong className="font-mono text-sm text-teal-700 dark:text-teal-400">${totales.monto.toFixed(2)}</strong>
                </div>
                <button
                  type="button"
                  onClick={handleConfirmarFacturacion}
                  className="min-h-11 inline-flex items-center justify-center gap-2 px-4 sm:px-5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold shadow-sm"
                >
                  <FileCheck2 className="w-4 h-4" />
                  {pedidoActual.estado === 'facturado' ? 'Actualizar facturación' : 'Marcar como facturado'}
                </button>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
};
