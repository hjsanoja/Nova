import React, { useState } from 'react';
import { PedidoCabecera, PedidoDetalle, Cliente, Drogueria, Producto } from '../types/pharmacy';
import { 
  Eye, 
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface MyOrdersTabProps {
  pedidos: PedidoCabecera[];
  detalles: PedidoDetalle[];
  clientes: Cliente[];
  droguerias: Drogueria[];
  productos: Producto[];
  onTransmitirBorrador?: (pedidoId: string) => void;
}

export const MyOrdersTab: React.FC<MyOrdersTabProps> = ({
  pedidos,
  detalles,
  clientes,
  droguerias,
  productos,
}) => {
  const { esClaro } = useTheme();
  const [pedidoDetalleAbiertoId, setPedidoDetalleAbiertoId] = useState<string | null>(null);

  const productosMap = new Map<string, Producto>();
  productos.forEach((p) => productosMap.set(p.id, p));

  const pedidoSeleccionado = pedidos.find((p) => p.id === pedidoDetalleAbiertoId);
  const lineasSeleccionadas = pedidoSeleccionado
    ? detalles.filter((d) => d.pedido_id === pedidoSeleccionado.id)
    : [];

  return (
    <div className="space-y-5">

      {/* Cabecera Limpia */}
      <div className={`p-5 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
        esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800 shadow-lg'
      }`}>
        <div>
          <h2 className={`text-xl font-bold ${esClaro ? 'text-slate-900' : 'text-white'}`}>
            Historial de Pedidos en Campo
          </h2>
          <p className={`text-xs mt-0.5 ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
            Trazabilidad de tus órdenes tomadas, confirmación por teletransferencia y reporte de quiebres.
          </p>
        </div>

        <div className={`text-right shrink-0 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
          esClaro ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-slate-800 text-slate-300 border-slate-700'
        }`}>
          <span>{pedidos.length} órdenes registradas</span>
        </div>
      </div>

      {/* Lista de Pedidos */}
      <div className="space-y-3">
        {pedidos.map((ped) => {
          const cli = clientes.find((c) => c.id === ped.cliente_id || c.ident01 === ped.cliente_id);
          const drog = droguerias.find((d) => d.id === ped.drogueria_id);
          const lineas = detalles.filter((d) => d.pedido_id === ped.id);
          const totalUnidades = lineas.reduce((acc, curr) => acc + curr.cantidad_solicitada, 0);

          return (
            <div
              key={ped.id}
              className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                esClaro 
                  ? 'bg-white border-slate-200 hover:border-slate-300 shadow-sm' 
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`font-mono font-bold text-sm ${esClaro ? 'text-slate-900' : 'text-white'}`}>
                    {ped.numero_pedido}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    ped.estado === 'procesado_total'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                      : ped.estado === 'procesado_parcial'
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                      : ped.estado === 'enviado_teletransferencia'
                      ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}>
                    {ped.estado}
                  </span>
                </div>

                <div className={`text-sm font-bold ${esClaro ? 'text-slate-800' : 'text-slate-200'}`}>
                  {cli?.nombre_fantasia || cli?.nombre_comercial || cli?.razon_social || 'Farmacia'} <span className="text-xs font-normal text-slate-400">({cli?.rif || 'Sin RIF'})</span>
                </div>

                <div className={`text-xs flex flex-wrap items-center gap-2 sm:gap-3 ${
                  esClaro ? 'text-slate-500' : 'text-slate-400'
                }`}>
                  <span>Droguería: <b className="text-teal-600 dark:text-teal-400">{drog?.nombre_drogueria}</b></span>
                  <span>•</span>
                  <span>Fecha: {new Date(ped.fecha_pedido).toLocaleDateString()}</span>
                  <span>•</span>
                  <span>Equipo: <b>{ped.equipo_origen}</b></span>
                </div>
              </div>

              {/* Métricas y Acciones - Responsive y amigable al pulgar */}
              <div className="flex items-center justify-between sm:justify-end gap-4 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
                <div className="text-left sm:text-right">
                  <span className={`text-[10px] uppercase font-bold block ${esClaro ? 'text-slate-400' : 'text-slate-500'}`}>
                    Unidades
                  </span>
                  <span className={`text-sm font-bold font-mono ${esClaro ? 'text-slate-800' : 'text-slate-200'}`}>
                    {totalUnidades} uds ({lineas.length} ítems)
                  </span>
                </div>

                <div className={`text-right pl-3 border-l ${esClaro ? 'border-slate-200' : 'border-slate-800'}`}>
                  <span className={`text-[10px] uppercase font-bold block ${esClaro ? 'text-slate-400' : 'text-slate-500'}`}>
                    Fill-Rate
                  </span>
                  <span className={`text-sm font-bold font-mono ${
                    ped.fill_rate >= 95 
                      ? 'text-emerald-600 dark:text-emerald-400' 
                      : ped.fill_rate >= 80 
                      ? 'text-amber-600 dark:text-amber-400' 
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {ped.fill_rate}%
                  </span>
                </div>

                <button
                  onClick={() => setPedidoDetalleAbiertoId(ped.id)}
                  className={`min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
                    esClaro ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                  }`}
                  title="Ver detalle del pedido"
                  aria-label="Ver detalle"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de Detalle de Pedido */}
      {pedidoSeleccionado && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className={`p-4 sm:p-6 rounded-2xl border max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto ${
            esClaro ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            
            <div className={`flex items-center justify-between border-b pb-3 ${
              esClaro ? 'border-slate-200' : 'border-slate-800'
            }`}>
              <div>
                <h3 className="text-base font-bold font-mono">
                  {pedidoSeleccionado.numero_pedido}
                </h3>
                <p className={`text-xs ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
                  Estado: <b className="text-teal-600 dark:text-teal-400">{pedidoSeleccionado.estado}</b> • Fill-Rate: <b>{pedidoSeleccionado.fill_rate}%</b>
                </p>
              </div>
              <button
                onClick={() => setPedidoDetalleAbiertoId(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white text-2xl font-bold rounded-xl"
                aria-label="Cerrar modal"
              >
                &times;
              </button>
            </div>

            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-left text-xs">
                <thead className={`border-b text-[11px] uppercase tracking-wider font-semibold ${
                  esClaro ? 'bg-slate-50 text-slate-600 border-slate-200' : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}>
                  <tr>
                    <th className="py-2.5 px-3">Medicamento</th>
                    <th className="py-2.5 px-3 text-center">Uds Solicitadas</th>
                    <th className="py-2.5 px-3 text-center">Uds Confirmadas</th>
                    <th className="py-2.5 px-3 text-center">Descuento %</th>
                    <th className="py-2.5 px-3">Estado / Quiebre</th>
                  </tr>
                </thead>
                <tbody className={`divide-y font-normal ${
                  esClaro ? 'divide-slate-200 text-slate-700' : 'divide-slate-800 text-slate-300'
                }`}>
                  {lineasSeleccionadas.map((linea) => {
                    const prod = productosMap.get(linea.producto_id);
                    return (
                      <tr key={linea.id} className={esClaro ? 'hover:bg-slate-50' : 'hover:bg-slate-800/30'}>
                        <td className="py-2.5 px-3">
                          <div className={`font-bold ${esClaro ? 'text-slate-900' : 'text-white'}`}>{prod?.nombre_comercial}</div>
                          <div className={`text-[10px] ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>{prod?.principio_activo}</div>
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold font-mono">
                          {linea.cantidad_solicitada}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-teal-600 dark:text-teal-400 font-mono">
                          {linea.cantidad_confirmada}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-amber-600 dark:text-amber-400">
                          {linea.descuento_porcentaje}%
                        </td>
                        <td className="py-2.5 px-3 text-[11px]">
                          {linea.motivo_ajuste === 'sin_quiebre' ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Confirmado</span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400 font-semibold">{linea.motivo_ajuste}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className={`flex justify-end pt-3 border-t ${esClaro ? 'border-slate-200' : 'border-slate-800'}`}>
              <button
                onClick={() => setPedidoDetalleAbiertoId(null)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold ${
                  esClaro ? 'bg-slate-100 hover:bg-slate-200 text-slate-800' : 'bg-slate-800 hover:bg-slate-700 text-white'
                }`}
              >
                Cerrar
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
