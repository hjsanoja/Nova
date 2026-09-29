import React, { useState, useMemo } from 'react';
import { 
  PedidoCabecera, 
  PedidoDetalle, 
  Cliente, 
  Drogueria, 
  Producto, 
  MotivoAjuste, 
  EstadoPedido 
} from '../types/pharmacy';
import { generarCsvDrogueria, descargarArchivoCsv } from '../services/csvExportEngine';
import { 
  CheckCircle2, 
  Download, 
  Search,
  RefreshCw,
  Send,
  FileCheck2,
  AlertTriangle,
  Building,
  User,
  Calendar,
  FileSpreadsheet,
  Check,
  PackageCheck,
  ChevronRight
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface TeletransferQueueTabProps {
  pedidosCabecera: PedidoCabecera[];
  pedidosDetalle: PedidoDetalle[];
  clientes: Cliente[];
  droguerias: Drogueria[];
  productos: Producto[];
  onActualizarDetalle: (detalleId: string, cantidadConfirmada: number, motivoAjuste: MotivoAjuste, observaciones?: string) => void;
  onCambiarEstadoPedido: (pedidoId: string, nuevoEstado: EstadoPedido) => void;
}

export const TeletransferQueueTab: React.FC<TeletransferQueueTabProps> = ({
  pedidosCabecera,
  pedidosDetalle,
  clientes,
  droguerias,
  productos,
  onActualizarDetalle,
  onCambiarEstadoPedido,
}) => {
  const { esClaro } = useTheme();
  const [pedidoSeleccionadoId, setPedidoSeleccionadoId] = useState<string>(pedidosCabecera[0]?.id || '');
  const [filtroDrogueria, setFiltroDrogueria] = useState<string>('all');
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState<string>('');
  const [mensajeToast, setMensajeToast] = useState<string | null>(null);

  // Modal / Sección para Conciliación de Facturación
  const [modalFacturacionAbierto, setModalFacturacionAbierto] = useState(false);
  const [numeroFacturaDrogueria, setNumeroFacturaDrogueria] = useState('');

  const productosMap = useMemo(() => {
    const map = new Map<string, Producto>();
    productos.forEach((p) => map.set(p.id, p));
    return map;
  }, [productos]);

  const pedidosFiltrados = useMemo(() => {
    return pedidosCabecera.filter((ped) => {
      if (filtroDrogueria !== 'all' && ped.drogueria_id !== filtroDrogueria) return false;
      if (filtroEstado !== 'todos' && ped.estado !== filtroEstado) return false;
      if (!busqueda) return true;
      const q = busqueda.toLowerCase().trim();
      const cli = clientes.find((c) => c.id === ped.cliente_id || c.ident01 === ped.cliente_id);
      const nombreCli = (cli?.nombre_fantasia || cli?.nombre_comercial || cli?.razon_social || '').toLowerCase();
      const rifCli = (cli?.rif || '').toLowerCase();
      const numPed = (ped.numero_pedido || '').toLowerCase();
      return (
        numPed.includes(q) ||
        nombreCli.includes(q) ||
        rifCli.includes(q)
      );
    });
  }, [pedidosCabecera, filtroDrogueria, filtroEstado, busqueda, clientes]);

  const pedidoActual = useMemo(() => {
    return pedidosFiltrados.find((p) => p.id === pedidoSeleccionadoId) || pedidosFiltrados[0] || pedidosCabecera[0];
  }, [pedidosFiltrados, pedidoSeleccionadoId, pedidosCabecera]);

  const clienteActual = useMemo(() => {
    if (!pedidoActual) return clientes[0];
    return clientes.find((c) => c.id === pedidoActual.cliente_id || c.ident01 === pedidoActual.cliente_id) || clientes[0];
  }, [clientes, pedidoActual]);

  const drogueriaActual = useMemo(() => {
    if (!pedidoActual) return droguerias[0];
    return droguerias.find((d) => d.id === pedidoActual.drogueria_id) || droguerias[0];
  }, [droguerias, pedidoActual]);

  const detallesActuales = useMemo(() => {
    if (!pedidoActual) return [];
    return pedidosDetalle.filter((d) => d.pedido_id === pedidoActual.id);
  }, [pedidosDetalle, pedidoActual]);

  const { unidadesSolicitadas, unidadesConfirmadas, montoTotalSolicitado, montoTotalConfirmado, fillRateCalculado } = useMemo(() => {
    let sol = 0;
    let conf = 0;
    let totalSolMonto = 0;
    let totalConfMonto = 0;
    detallesActuales.forEach((d) => {
      sol += d.cantidad_solicitada;
      conf += d.cantidad_confirmada;
      const prod = productosMap.get(d.producto_id);
      const precio = d.precio_unitario || prod?.precio_lista || 1;
      const descFactor = 1 - (d.descuento_porcentaje || 0) / 100;
      totalSolMonto += d.cantidad_solicitada * precio * descFactor;
      totalConfMonto += conf * precio * descFactor;
    });
    const fill = sol > 0 ? Number(((conf / sol) * 100).toFixed(1)) : 100;
    return {
      unidadesSolicitadas: sol,
      unidadesConfirmadas: conf,
      montoTotalSolicitado: totalSolMonto,
      montoTotalConfirmado: totalConfMonto,
      fillRateCalculado: fill,
    };
  }, [detallesActuales, productosMap]);

  const handleDescargarCsv = () => {
    if (!pedidoActual || !drogueriaActual || !clienteActual) return;
    const csvResult = generarCsvDrogueria(pedidoActual, detallesActuales, clienteActual, drogueriaActual, productosMap);
    descargarArchivoCsv(csvResult);
    setMensajeToast(`Descargado CSV con layout para ${drogueriaActual.nombre_drogueria}`);
    setTimeout(() => setMensajeToast(null), 3000);
  };

  const handleMarcarProcesado = () => {
    if (!pedidoActual || !drogueriaActual || !clienteActual) return;
    onCambiarEstadoPedido(pedidoActual.id, 'en_proceso');
    setMensajeToast(`Pedido ${pedidoActual.numero_pedido} marcado como Enviado a Droguería.`);
    setTimeout(() => setMensajeToast(null), 3500);
  };

  const handleConfirmarFacturacionCompleta = () => {
    if (!pedidoActual) return;
    onCambiarEstadoPedido(pedidoActual.id, 'facturado');
    setModalFacturacionAbierto(false);
    setMensajeToast(`¡Pedido ${pedidoActual.numero_pedido} confirmado como FACTURADO con éxito!`);
    setTimeout(() => setMensajeToast(null), 4000);
  };

  const getEstadoBadge = (estado: EstadoPedido) => {
    switch (estado) {
      case 'facturado':
        return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">Facturado</span>;
      case 'en_proceso':
        return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300">En Droguería</span>;
      case 'enviado_teletransferencia':
        return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300">Por Procesar</span>;
      case 'procesado_total':
        return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 border border-teal-300">Despachado Total</span>;
      case 'procesado_parcial':
        return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 border border-orange-300">Despacho Parcial</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300">{estado}</span>;
    }
  };

  return (
    <div className="flex flex-col gap-5 w-full">

      {/* Toast Notification */}
      {mensajeToast && (
        <div className="fixed top-16 left-4 right-4 md:left-auto md:right-8 bg-slate-900 text-white py-3 px-5 rounded-xl shadow-xl flex items-center gap-3 z-50 animate-in fade-in slide-in-from-top">
          <CheckCircle2 className="w-5 h-5 text-teal-400 shrink-0" />
          <span className="text-sm font-medium">{mensajeToast}</span>
        </div>
      )}

      {/* Cabecera Principal y Filtros Simplificados */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className={`font-display text-2xl md:text-3xl font-bold tracking-tight ${
            esClaro ? 'text-slate-900' : 'text-white'
          }`}>
            Teletransferencias & Procesamiento
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gestión, descarga de CSV por droguería y confirmación de unidades facturadas.
          </p>
        </div>

        {/* Barra de Filtros */}
        <div className={`flex flex-wrap items-center gap-2 p-1.5 rounded-xl border shadow-xs ${
          esClaro ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
        }`}>
          {/* Buscador */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por N° pedido o farmacia..."
              className={`pl-8 pr-3 py-1.5 rounded-lg text-xs w-48 sm:w-56 focus:outline-none focus:ring-1 focus:ring-teal-500 border ${
                esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-800 border-slate-700 text-white'
              }`}
            />
          </div>

          {/* Filtro Droguería */}
          <select
            value={filtroDrogueria}
            onChange={(e) => setFiltroDrogueria(e.target.value)}
            className={`text-xs font-semibold py-1.5 px-2.5 rounded-lg border focus:outline-none ${
              esClaro ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-slate-800 border-slate-700 text-slate-200'
            }`}
          >
            <option value="all">Todas las Droguerías</option>
            {droguerias.map((d) => (
              <option key={d.id} value={d.id}>{d.nombre_drogueria}</option>
            ))}
          </select>

          {/* Filtro Estado */}
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className={`text-xs font-semibold py-1.5 px-2.5 rounded-lg border focus:outline-none ${
              esClaro ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-slate-800 border-slate-700 text-slate-200'
            }`}
          >
            <option value="todos">Todos los Estados</option>
            <option value="enviado_teletransferencia">Pendientes por Procesar</option>
            <option value="en_proceso">En Droguería</option>
            <option value="facturado">Facturados</option>
          </select>
        </div>
      </div>

      {/* Grid de 2 Columnas: Lista de Pedidos (Izquierda) + Detalle & Facturación (Derecha) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* Panel Izquierdo: Lista de Pedidos (4 cols en LG) */}
        <div className="lg:col-span-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Pedidos Recibidos ({pedidosFiltrados.length})
            </span>
            <span className="text-[11px] text-slate-500 font-mono">
              Actualizado
            </span>
          </div>

          <div className="space-y-2 max-h-[75vh] overflow-y-auto pr-1">
            {pedidosFiltrados.length === 0 ? (
              <div className={`p-8 text-center rounded-2xl border text-slate-400 text-xs ${
                esClaro ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
              }`}>
                No se encontraron pedidos con los filtros aplicados.
              </div>
            ) : (
              pedidosFiltrados.map((ped) => {
                const cli = clientes.find((c) => c.id === ped.cliente_id);
                const drog = droguerias.find((d) => d.id === ped.drogueria_id);
                const isSelected = ped.id === pedidoActual?.id;

                return (
                  <button
                    key={ped.id}
                    onClick={() => {
                      setPedidoSeleccionadoId(ped.id);
                      setModalFacturacionAbierto(false);
                    }}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all relative ${
                      isSelected
                        ? 'border-teal-600 bg-teal-500/5 shadow-xs ring-1 ring-teal-500'
                        : esClaro
                        ? 'bg-white border-slate-200 hover:border-slate-300'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-mono text-xs font-bold text-teal-600 dark:text-teal-400">
                        {ped.numero_pedido}
                      </span>
                      {getEstadoBadge(ped.estado)}
                    </div>

                    <p className={`font-semibold text-xs leading-snug truncate ${
                      esClaro ? 'text-slate-900' : 'text-white'
                    }`}>
                      {cli?.nombre_fantasia || cli?.nombre_comercial || cli?.razon_social || 'Farmacia Desconocida'}
                    </p>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2">
                      <span className="truncate max-w-[130px]">{drog?.nombre_drogueria}</span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                        ${ped.total_solicitado.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                      <span>Eq: {ped.equipo_origen}</span>
                      <span>{new Date(ped.fecha_pedido).toLocaleDateString()}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Panel Derecho: Detalle del Pedido, Descarga CSV y Confirmación de Facturación (8 cols) */}
        {pedidoActual ? (
          <div className="lg:col-span-8 flex flex-col gap-4">
            
            {/* Tarjeta de Resumen y Acciones Rápidas */}
            <div className={`p-5 rounded-2xl border shadow-xs space-y-4 ${
              esClaro ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}>
              {/* Encabezado del Pedido Seleccionado */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-bold text-teal-600 dark:text-teal-400">
                      {pedidoActual.numero_pedido}
                    </span>
                    {getEstadoBadge(pedidoActual.estado)}
                  </div>
                  <h3 className={`text-base font-bold ${esClaro ? 'text-slate-900' : 'text-white'}`}>
                    {clienteActual?.nombre_fantasia || clienteActual?.nombre_comercial || clienteActual?.razon_social || 'Farmacia'} ({clienteActual?.rif || 'Sin RIF'})
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Droguería Destino: <strong className="text-slate-700 dark:text-slate-200">{drogueriaActual?.nombre_drogueria}</strong> · Equipo Origen: {pedidoActual.equipo_origen}
                  </p>
                </div>

                {/* Botones de Acción de Teletransferencia */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Descargar CSV en formato Droguería */}
                  <button
                    onClick={handleDescargarCsv}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors shadow-xs"
                    title={`Descargar archivo formateado para ${drogueriaActual?.nombre_drogueria}`}
                  >
                    <Download className="w-3.5 h-3.5 text-teal-600" />
                    <span>Descargar CSV Droguería</span>
                  </button>

                  {/* Marcar como Enviado a Droguería si está pendiente */}
                  {pedidoActual.estado === 'enviado_teletransferencia' && (
                    <button
                      onClick={handleMarcarProcesado}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-xs"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Confirmar Envío a Droguería</span>
                    </button>
                  )}

                  {/* Botón Principal: Confirmar Facturación & Unidades Reales */}
                  <button
                    onClick={() => setModalFacturacionAbierto(true)}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                      pedidoActual.estado === 'facturado'
                        ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                        : 'bg-teal-600 text-white hover:bg-teal-500 ring-2 ring-teal-500/30'
                    }`}
                  >
                    <PackageCheck className="w-4 h-4" />
                    <span>{pedidoActual.estado === 'facturado' ? 'Ver / Reconciliar Facturación' : 'Confirmar Facturado Droguería'}</span>
                  </button>
                </div>
              </div>

              {/* Métricas Clave de la Orden */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className={`p-3 rounded-xl border ${esClaro ? 'bg-slate-50 border-slate-100' : 'bg-slate-800/40 border-slate-800'}`}>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Unidades Solicitadas</span>
                  <span className="text-base font-bold font-mono text-slate-800 dark:text-slate-100">
                    {unidadesSolicitadas} uds
                  </span>
                </div>
                <div className={`p-3 rounded-xl border ${esClaro ? 'bg-slate-50 border-slate-100' : 'bg-slate-800/40 border-slate-800'}`}>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Unidades Facturadas</span>
                  <span className="text-base font-bold font-mono text-teal-600 dark:text-teal-400">
                    {unidadesConfirmadas} uds
                  </span>
                </div>
                <div className={`p-3 rounded-xl border ${esClaro ? 'bg-slate-50 border-slate-100' : 'bg-slate-800/40 border-slate-800'}`}>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Monto Liquidado</span>
                  <span className="text-base font-bold font-mono text-slate-800 dark:text-slate-100">
                    ${montoTotalConfirmado.toFixed(2)}
                  </span>
                </div>
                <div className={`p-3 rounded-xl border ${esClaro ? 'bg-slate-50 border-slate-100' : 'bg-slate-800/40 border-slate-800'}`}>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Fill-Rate</span>
                  <span className={`text-base font-bold font-mono ${
                    fillRateCalculado >= 90 ? 'text-emerald-600' : fillRateCalculado >= 70 ? 'text-amber-500' : 'text-rose-500'
                  }`}>
                    {fillRateCalculado}%
                  </span>
                </div>
              </div>
            </div>

            {/* SECCIÓN / MODAL DE CONCILIACIÓN DE FACTURACIÓN: Renglón por Renglón */}
            <div className={`rounded-2xl border shadow-xs overflow-hidden ${
              esClaro ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}>
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/30">
                <div>
                  <h4 className={`text-sm font-bold flex items-center gap-2 ${esClaro ? 'text-slate-900' : 'text-white'}`}>
                    <PackageCheck className="w-4 h-4 text-teal-600" />
                    Conciliación de Unidades Facturadas por Producto
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Indica cuántas unidades aprobó y facturó la droguería para cada renglón.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-semibold">N° Factura:</span>
                  <input
                    type="text"
                    value={numeroFacturaDrogueria}
                    onChange={(e) => setNumeroFacturaDrogueria(e.target.value)}
                    placeholder="Ej. FAC-89302"
                    className={`px-2.5 py-1 text-xs rounded-lg border font-mono font-semibold focus:outline-none focus:ring-1 focus:ring-teal-500 ${
                      esClaro ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-800 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              {/* Tabla de Renglones */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className={`border-b text-[11px] uppercase tracking-wider font-semibold ${
                      esClaro ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-slate-800/60 text-slate-400 border-slate-800'
                    }`}>
                      <th className="py-3 px-4">SKU</th>
                      <th className="py-3 px-4">Medicamento / Presentación</th>
                      <th className="py-3 px-3 text-right">Solicitado</th>
                      <th className="py-3 px-3 text-center">Facturado (Uds)</th>
                      <th className="py-3 px-3 text-right">Precio</th>
                      <th className="py-3 px-3 text-right">Subtotal</th>
                      <th className="py-3 px-4">Motivo si hay quiebre</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {detallesActuales.map((det) => {
                      const prod = productosMap.get(det.producto_id);
                      const hayDiferencia = det.cantidad_confirmada < det.cantidad_solicitada;

                      return (
                        <tr 
                          key={det.id}
                          className={`transition-colors ${
                            hayDiferencia 
                              ? esClaro ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'bg-amber-950/20 hover:bg-amber-950/30'
                              : esClaro ? 'hover:bg-slate-50/60' : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-3 px-4 font-mono text-slate-500 font-medium">
                            {prod?.sku || 'SKU'}
                          </td>
                          <td className="py-3 px-4">
                            <p className={`font-bold ${esClaro ? 'text-slate-900' : 'text-white'}`}>
                              {prod?.nombre_comercial || 'Producto'}
                            </p>
                            <span className="text-[11px] text-slate-400">
                              {prod?.presentacion} · {prod?.laboratorio}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-semibold text-slate-700 dark:text-slate-300">
                            {det.cantidad_solicitada}
                          </td>

                          {/* Campo de Entrada de Unidades Facturadas por el Teletransferencista */}
                          <td className="py-3 px-3 text-center">
                            <div className="inline-flex items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                max={det.cantidad_solicitada * 2}
                                value={det.cantidad_confirmada}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  const motivo: MotivoAjuste = val < det.cantidad_solicitada ? 'quiebre_stock_drogueria' : 'sin_quiebre';
                                  onActualizarDetalle(det.id, val, motivo, det.observaciones_linea);
                                }}
                                className={`w-16 py-1 px-1.5 text-center font-mono font-bold text-xs rounded-lg border focus:outline-none focus:ring-1 focus:ring-teal-500 ${
                                  hayDiferencia
                                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                                    : 'border-slate-300 dark:border-slate-700 text-teal-600 dark:text-teal-400'
                                }`}
                              />
                            </div>
                          </td>

                          <td className="py-3 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                            ${det.precio_unitario.toFixed(2)}
                          </td>

                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                            ${det.subtotal_confirmado.toFixed(2)}
                          </td>

                          <td className="py-3 px-4">
                            {hayDiferencia ? (
                              <select
                                value={det.motivo_ajuste}
                                onChange={(e) => {
                                  onActualizarDetalle(det.id, det.cantidad_confirmada, e.target.value as MotivoAjuste, det.observaciones_linea);
                                }}
                                className={`text-[11px] py-1 px-2 rounded-lg border focus:outline-none ${
                                  esClaro ? 'bg-white border-amber-300 text-amber-900' : 'bg-slate-800 border-amber-700 text-amber-200'
                                }`}
                              >
                                <option value="quiebre_stock_drogueria">Quiebre Almacén</option>
                                <option value="limite_credito">Límite Crédito</option>
                                <option value="producto_descontinuado">Descontinuado</option>
                                <option value="ajuste_comercial">Ajuste Comercial</option>
                                <option value="otro">Otro</option>
                              </select>
                            ) : (
                              <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                                <Check className="w-3.5 h-3.5" /> Completo
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Botón de Confirmación y Cierre de Pedido Facturado */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  Total facturado: <strong className="font-bold text-slate-800 dark:text-white font-mono">{unidadesConfirmadas} unidades</strong> por un monto de <strong className="font-bold text-teal-600 font-mono">${montoTotalConfirmado.toFixed(2)}</strong>
                </div>

                <button
                  type="button"
                  onClick={handleConfirmarFacturacionCompleta}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-sm transition-all"
                >
                  <FileCheck2 className="w-4 h-4" />
                  <span>Marcar como Facturado y Guardar Unidades Reales</span>
                </button>
              </div>

            </div>

          </div>
        ) : null}

      </div>

    </div>
  );
};
