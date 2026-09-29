import React, { useState, useMemo } from 'react';
import { 
  Cliente, 
  Producto, 
  HistoricoPedidoPrevio, 
  PedidoCabecera, 
  PedidoDetalle, 
  SugeridoItem, 
  ParametrosSugerido 
} from '../types/pharmacy';
import { calcularPedidoSugeridoLocal } from '../services/suggestedOrderEngine';
import { 
  Sparkles, 
  Calendar, 
  TrendingUp, 
  ShoppingCart, 
  Check, 
  Star, 
  ArrowRight,
  Package,
  Plus,
  Minus
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface SuggestedOrderTabProps {
  clientes: Cliente[];
  productos: Producto[];
  historicoPrevio: HistoricoPedidoPrevio[];
  pedidosCabecera: PedidoCabecera[];
  pedidosDetalle: PedidoDetalle[];
  onGenerarPedidoDesdeSugerido?: (clienteId: string, itemsSeleccionados: { producto: Producto; cantidad: number; descuento: number }[]) => void;
}

export const SuggestedOrderTab: React.FC<SuggestedOrderTabProps> = ({
  clientes,
  productos,
  historicoPrevio,
  pedidosCabecera,
  pedidosDetalle,
  onGenerarPedidoDesdeSugerido,
}) => {
  const { esClaro } = useTheme();
  const [clienteSeleccionadoId, setClienteSeleccionadoId] = useState<string>(clientes[1]?.id || clientes[0]?.id || '');
  const [diasAnalisis, setDiasAnalisis] = useState<30 | 60 | 90>(60);
  const [factorCrecimiento, setFactorCrecimiento] = useState<number>(1.0);
  const [soloConHistoria, setSoloConHistoria] = useState<boolean>(false);
  const [incluirPrioritariosSinHistoria, setIncluirPrioritariosSinHistoria] = useState<boolean>(true);

  const [cantidadesModificadas, setCantidadesModificadas] = useState<Record<string, number>>({});
  const [itemsSeleccionados, setItemsSeleccionados] = useState<Record<string, boolean>>({});
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  const clienteActual = useMemo(() => {
    return clientes.find((c) => c.id === clienteSeleccionadoId) || clientes[0];
  }, [clientes, clienteSeleccionadoId]);

  const sugeridos = useMemo<SugeridoItem[]>(() => {
    if (!clienteActual) return [];
    const params: ParametrosSugerido = {
      cliente_id: clienteActual.id,
      dias_analisis: diasAnalisis,
      factor_crecimiento: factorCrecimiento,
      solo_con_historia: soloConHistoria,
      incluir_prioritarios_sin_historia: incluirPrioritariosSinHistoria,
    };

    return calcularPedidoSugeridoLocal(
      clienteActual,
      productos,
      historicoPrevio,
      pedidosCabecera,
      pedidosDetalle,
      params
    );
  }, [
    clienteActual,
    productos,
    historicoPrevio,
    pedidosCabecera,
    pedidosDetalle,
    diasAnalisis,
    factorCrecimiento,
    soloConHistoria,
    incluirPrioritariosSinHistoria,
  ]);

  const resumenTotales = useMemo(() => {
    let udsA = 0;
    let udsB = 0;
    let totalUdsHistoricas = 0;
    let totalSugeridas = 0;
    let totalCajasEstimadas = 0;

    sugeridos.forEach((item) => {
      udsA += item.compras_equipo_a;
      udsB += item.compras_equipo_b;
      totalUdsHistoricas += item.total_unidades_historicas;
      const cant = cantidadesModificadas[item.producto_id] ?? item.sugerido_calculado;
      totalSugeridas += cant;
      totalCajasEstimadas += Math.ceil(cant / (item.empaque_minimo || 1));
    });

    return { 
      udsA, 
      udsB, 
      totalUdsHistoricas, 
      totalSugeridas, 
      totalCajasEstimadas,
      totalItemsConSugerido: sugeridos.filter((s) => s.sugerido_calculado > 0).length,
    };
  }, [sugeridos, cantidadesModificadas]);

  const handleToggleSeleccion = (productoId: string) => {
    setItemsSeleccionados((prev) => ({
      ...prev,
      [productoId]: !prev[productoId],
    }));
  };

  const handleSeleccionarTodos = () => {
    const todosSeleccionados = sugeridos.every((s) => itemsSeleccionados[s.producto_id]);
    const nuevo: Record<string, boolean> = {};
    if (!todosSeleccionados) {
      sugeridos.forEach((s) => {
        if (s.sugerido_calculado > 0) nuevo[s.producto_id] = true;
      });
    }
    setItemsSeleccionados(nuevo);
  };

  const handleCambiarCantidad = (productoId: string, cantidad: number) => {
    setCantidadesModificadas((prev) => ({
      ...prev,
      [productoId]: Math.max(0, cantidad),
    }));
  };

  const handleCrearPedido = () => {
    const items = sugeridos
      .filter((s) => itemsSeleccionados[s.producto_id] || (s.sugerido_calculado > 0 && Object.keys(itemsSeleccionados).length === 0))
      .map((s) => {
        const prod = productos.find((p) => p.id === s.producto_id);
        if (!prod) return null;
        const cant = cantidadesModificadas[s.producto_id] ?? s.sugerido_calculado;
        return {
          producto: prod,
          cantidad: cant,
          descuento: s.descuento_sugerido,
        };
      })
      .filter((it): it is { producto: Producto; cantidad: number; descuento: number } => it !== null && it.cantidad > 0);

    if (items.length === 0) {
      alert('Por favor selecciona al menos un medicamento con cantidad mayor a cero.');
      return;
    }

    if (onGenerarPedidoDesdeSugerido && clienteActual) {
      onGenerarPedidoDesdeSugerido(clienteActual.id || clienteActual.ident01, items);
    }

    setMensajeExito(`¡Pedido sugerido preparado con ${items.length} productos para ${clienteActual?.nombre_fantasia || clienteActual?.nombre_comercial || 'la farmacia'}!`);
    setTimeout(() => setMensajeExito(null), 4000);
  };

  return (
    <div className="space-y-5">

      {/* Selector de Cliente y Panel de Parámetros del Motor */}
      <div className={`p-5 rounded-2xl border transition-all space-y-4 ${
        esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800 shadow-lg'
      }`}>
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Selector de Farmacia / Cliente */}
          <div className="flex-1">
            <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${
              esClaro ? 'text-slate-600' : 'text-slate-300'
            }`}>
              Cliente Farmacéutico
            </label>
            <select
              value={clienteSeleccionadoId}
              onChange={(e) => setClienteSeleccionadoId(e.target.value)}
              className={`w-full text-xs font-medium rounded-xl p-2.5 border focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                esClaro 
                  ? 'bg-slate-50 border-slate-200 text-slate-900' 
                  : 'bg-slate-950 border-slate-700 text-white'
              }`}
            >
              {clientes.map((cli) => (
                <option key={cli.id || cli.ident01} value={cli.id || cli.ident01}>
                  {cli.ident01 || cli.codigo_cliente} • {cli.nombre_fantasia || cli.nombre_comercial || cli.razon_social} ({cli.rif}) - Clave {cli.clasificacion_abc}
                </option>
              ))}
            </select>
          </div>

          {/* Ventana de Análisis 30 / 60 / 90 días */}
          <div className="shrink-0">
            <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5 ${
              esClaro ? 'text-slate-600' : 'text-slate-300'
            }`}>
              <Calendar className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              Historial
            </label>
            <div className={`inline-flex p-1 rounded-xl border ${
              esClaro ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-700'
            }`}>
              {([30, 60, 90] as const).map((dias) => (
                <button
                  key={dias}
                  onClick={() => setDiasAnalisis(dias)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    diasAnalisis === dias
                      ? 'bg-teal-600 text-white shadow-sm'
                      : esClaro
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {dias} Días
                </button>
              ))}
            </div>
          </div>

          {/* Factor de Crecimiento / Reposición */}
          <div className="shrink-0">
            <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5 ${
              esClaro ? 'text-slate-600' : 'text-slate-300'
            }`}>
              <TrendingUp className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              Factor Reposición
            </label>
            <select
              value={factorCrecimiento}
              onChange={(e) => setFactorCrecimiento(Number(e.target.value))}
              className={`text-xs font-medium rounded-xl px-3 py-2 border focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                esClaro 
                  ? 'bg-slate-50 border-slate-200 text-slate-900' 
                  : 'bg-slate-950 border-slate-700 text-white'
              }`}
            >
              <option value={1.0}>100% (Normal)</option>
              <option value={1.15}>+15% (Campaña / Quincena)</option>
              <option value={1.25}>+25% (Temporada Alta)</option>
              <option value={0.85}>-15% (Conservador)</option>
            </select>
          </div>

        </div>

        {/* Filtros rápidos del algoritmo */}
        <div className={`flex flex-wrap items-center justify-between gap-3 pt-3 border-t text-xs ${
          esClaro ? 'border-slate-100 text-slate-600' : 'border-slate-800 text-slate-300'
        }`}>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={soloConHistoria}
                onChange={(e) => setSoloConHistoria(e.target.checked)}
                className="w-4 h-4 rounded text-teal-600"
              />
              <span>Solo con compra previa</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={incluirPrioritariosSinHistoria}
                onChange={(e) => setIncluirPrioritariosSinHistoria(e.target.checked)}
                className="w-4 h-4 rounded text-teal-600"
              />
              <span className="flex items-center gap-1 font-medium">
                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                Sugerir colocación mínima en prioritarios
              </span>
            </label>
          </div>

          <div className={`text-[11px] ${esClaro ? 'text-slate-400' : 'text-slate-500'}`}>
            Consolidado global: acumula compras de Equipo A y B
          </div>
        </div>

      </div>

      {/* Métricas Consolidadas - 2 columnas en móvil y 4 en desktop */}
      {clienteActual && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          
          <div className={`p-4 rounded-xl border ${
            esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
          }`}>
            <span className={`text-[11px] font-semibold block ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
              Historial Comprado ({diasAnalisis}d)
            </span>
            <div className={`text-xl font-bold mt-1 ${esClaro ? 'text-slate-900' : 'text-white'}`}>
              {resumenTotales.totalUdsHistoricas} uds
            </div>
            <div className="flex items-center gap-2 mt-1 text-[11px]">
              <span className="text-amber-600 dark:text-amber-400 font-semibold">{resumenTotales.udsA} uds Eq. A</span>
              <span>•</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{resumenTotales.udsB} uds Eq. B</span>
            </div>
          </div>

          <div className={`p-4 rounded-xl border ${
            esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
          }`}>
            <span className={`text-[11px] font-semibold block ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
              Total Sugerido
            </span>
            <div className="text-xl font-bold text-teal-600 dark:text-teal-400 mt-1">
              {resumenTotales.totalSugeridas} uds
            </div>
            <div className={`text-[11px] mt-1 ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
              Múltiplos de empaque mínimo
            </div>
          </div>

          <div className={`p-4 rounded-xl border ${
            esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
          }`}>
            <span className={`text-[11px] font-semibold block ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
              Cajas Estimadas
            </span>
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">
              ~{resumenTotales.totalCajasEstimadas} cajas
            </div>
            <div className={`text-[11px] mt-1 ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
              {resumenTotales.totalItemsConSugerido} medicamentos sugeridos
            </div>
          </div>

          <div className={`p-4 rounded-xl border ${
            esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
          }`}>
            <span className={`text-[11px] font-semibold block ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
              Farmacia
            </span>
            <div className={`text-sm font-bold mt-1 truncate ${esClaro ? 'text-slate-900' : 'text-white'}`}>
              {clienteActual.nombre_comercial}
            </div>
            <div className={`text-[11px] mt-0.5 ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
              RIF: {clienteActual.rif} • Plazo: {clienteActual.dias_credito}d
            </div>
          </div>

        </div>
      )}

      {/* Notificación de éxito */}
      {mensajeExito && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>{mensajeExito}</span>
          </div>
        </div>
      )}

      {/* Tabla del Pedido Sugerido */}
      <div className={`rounded-2xl border overflow-hidden shadow-sm ${
        esClaro ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
      }`}>
        
        <div className={`px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2 ${
          esClaro ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-800/80 border-slate-800'
        }`}>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <h3 className={`text-sm font-bold ${esClaro ? 'text-slate-900' : 'text-white'}`}>
              Sugeridos Calculados ({sugeridos.length})
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSeleccionarTodos}
              className={`text-xs px-2.5 py-1 rounded transition-colors ${
                esClaro ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-slate-700 hover:bg-slate-600 text-white'
              }`}
            >
              Seleccionar Todos
            </button>

            <button
              onClick={handleCrearPedido}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white transition-all shadow-sm"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>Convertir a Pedido</span>
            </button>
          </div>
        </div>

        {/* VISTA MÓVIL: Tarjetas de Sugeridos con Steppers y Checkbox (block md:hidden) */}
        <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800">
          {sugeridos.map((item) => {
            const isSelected = !!itemsSeleccionados[item.producto_id];
            const cantidadActual = cantidadesModificadas[item.producto_id] ?? item.sugerido_calculado;
            const empaque = item.empaque_minimo || 1;

            return (
              <div 
                key={item.producto_id} 
                className={`p-4 space-y-2.5 transition-colors ${
                  isSelected ? esClaro ? 'bg-teal-50/50' : 'bg-teal-500/10' : ''
                }`}
              >
                {/* Checkbox y Nombre */}
                <div className="flex items-start gap-3">
                  <div className="pt-0.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSeleccion(item.producto_id)}
                      className="w-5 h-5 rounded text-teal-600 cursor-pointer"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className={`font-bold text-sm flex items-center gap-1.5 ${esClaro ? 'text-slate-900' : 'text-white'}`}>
                      <span className="truncate">{item.nombre_comercial}</span>
                      {item.es_prioritario && (
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                      )}
                    </div>
                    <div className={`text-xs mt-0.5 ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
                      {item.principio_activo} • <span className="font-mono">{item.sku}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {item.laboratorio} • Stock: <b>{item.stock_disponible}</b> • Empaque x{empaque}
                    </div>
                  </div>
                </div>

                {/* Justificación del Motor */}
                <div className={`text-[11px] p-2 rounded-lg border ${
                  esClaro ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}>
                  <span className="font-semibold text-teal-600 dark:text-teal-400">Algoritmo: </span>
                  {item.explicacion_algoritmo}
                </div>

                {/* Controles de Stepper Táctiles (44px) para Cantidad Sugerida */}
                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="text-xs">
                    <span className="text-slate-400 text-[10px] block">Descuento Sugerido:</span>
                    <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                      {item.descuento_sugerido.toFixed(1)}%
                    </span>
                  </div>

                  <div className={`p-1 rounded-xl border flex items-center justify-between min-w-44 ${
                    esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                  }`}>
                    <button
                      onClick={() => handleCambiarCantidad(item.producto_id, Math.max(0, cantidadActual - empaque))}
                      disabled={cantidadActual <= 0}
                      className="min-h-[44px] min-w-[44px] rounded-lg flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 active:scale-95"
                      aria-label="Restar sugerido"
                    >
                      <Minus className="w-4 h-4" />
                    </button>

                    <div className="text-center px-1">
                      <span className="text-[10px] text-slate-400 block leading-none">Sugerido:</span>
                      <span className="font-mono font-bold text-sm text-teal-600 dark:text-teal-400">
                        {cantidadActual} uds
                      </span>
                    </div>

                    <button
                      onClick={() => handleCambiarCantidad(item.producto_id, cantidadActual + empaque)}
                      className="min-h-[44px] min-w-[44px] rounded-lg flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 active:scale-95"
                      aria-label="Sumar sugerido"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>

        {/* VISTA DESKTOP: Tabla del Pedido Sugerido (hidden md:block) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={`border-b text-[11px] uppercase tracking-wider font-semibold ${
              esClaro ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-slate-950 text-slate-400 border-slate-800'
            }`}>
              <tr>
                <th className="py-2.5 px-3 w-10 text-center">Sel.</th>
                <th className="py-2.5 px-3">Producto / Principio Activo</th>
                <th className="py-2.5 px-3">Laboratorio</th>
                <th className="py-2.5 px-3 text-center">Prioridad</th>
                <th className="py-2.5 px-3 text-right">Historial</th>
                <th className="py-2.5 px-3 text-right">Consumo/Mes</th>
                <th className="py-2.5 px-3 text-center">Sugerido (Uds)</th>
                <th className="py-2.5 px-3 text-right">Descto %</th>
                <th className="py-2.5 px-3 text-center">Stock</th>
                <th className="py-2.5 px-3">Justificación del Algoritmo</th>
              </tr>
            </thead>
            <tbody className={`divide-y font-normal ${
              esClaro ? 'divide-slate-200 text-slate-700' : 'divide-slate-800 text-slate-300'
            }`}>
              {sugeridos.map((item) => {
                const isSelected = !!itemsSeleccionados[item.producto_id];
                const cantidadActual = cantidadesModificadas[item.producto_id] ?? item.sugerido_calculado;

                return (
                  <tr 
                    key={item.producto_id} 
                    className={`transition-colors ${
                      isSelected 
                        ? esClaro ? 'bg-teal-50/60' : 'bg-teal-500/10' 
                        : esClaro ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-2.5 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSeleccion(item.producto_id)}
                        className="w-4 h-4 rounded text-teal-600 cursor-pointer"
                      />
                    </td>

                    <td className="py-2.5 px-3">
                      <div className={`font-bold flex items-center gap-1.5 ${esClaro ? 'text-slate-900' : 'text-white'}`}>
                        {item.nombre_comercial}
                        {item.es_prioritario && (
                          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                        )}
                      </div>
                      <div className={`text-[11px] ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
                        {item.principio_activo} • <span className="font-mono">{item.sku}</span>
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 font-medium">
                      {item.laboratorio}
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      {item.es_prioritario ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400">
                          {item.factor_prioridad.toFixed(2)}x
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">1.00x</span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <span className={`font-bold block ${esClaro ? 'text-slate-900' : 'text-white'}`}>
                        {item.total_unidades_historicas} uds
                      </span>
                      <span className={`text-[10px] ${esClaro ? 'text-slate-400' : 'text-slate-500'}`}>
                        ({item.compras_equipo_a} A + {item.compras_equipo_b} B)
                      </span>
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-300">
                      {item.promedio_mensual.toFixed(1)} <span className="text-[10px] text-slate-400">u/m</span>
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      <div className="inline-flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          step={item.empaque_minimo || 1}
                          value={cantidadActual}
                          onChange={(e) => handleCambiarCantidad(item.producto_id, parseInt(e.target.value) || 0)}
                          className={`w-16 border text-center font-bold text-xs rounded-lg py-1 px-1 focus:outline-none focus:ring-1 focus:ring-teal-500 ${
                            esClaro 
                              ? 'bg-slate-50 border-slate-200 text-teal-800' 
                              : 'bg-slate-950 border-slate-700 text-teal-300'
                          }`}
                        />
                        <span className="text-[10px] text-slate-400 font-mono">
                          x{item.empaque_minimo}
                        </span>
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono text-amber-700 dark:text-amber-400 font-semibold">
                      {item.descuento_sugerido.toFixed(1)}%
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        item.stock_disponible > 500
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                      }`}>
                        {item.stock_disponible}
                      </span>
                    </td>

                    <td className={`py-2.5 px-3 text-[11px] max-w-xs ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
                      {item.explicacion_algoritmo}
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Barra de acción inferior para móvil */}
        <div className={`p-4 border-t flex flex-col sm:flex-row items-center justify-between gap-3 ${
          esClaro ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-950/80 border-slate-800'
        }`}>
          <div className="text-xs text-slate-500">
            <span>{Object.values(itemsSeleccionados).filter(Boolean).length} medicamentos seleccionados para la orden</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleSeleccionarTodos}
              className={`flex-1 sm:flex-none min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                esClaro ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100' : 'bg-slate-800 border-slate-700 text-slate-200'
              }`}
            >
              Seleccionar Todos
            </button>

            <button
              onClick={handleCrearPedido}
              className="flex-1 sm:flex-none min-h-[44px] flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs bg-teal-600 hover:bg-teal-700 text-white shadow-md transition-all active:scale-[0.99]"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Convertir a Pedido</span>
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};
