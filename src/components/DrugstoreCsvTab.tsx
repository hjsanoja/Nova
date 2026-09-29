import React, { useState, useMemo } from 'react';
import { Drogueria, PedidoCabecera, PedidoDetalle, Cliente, Producto } from '../types/pharmacy';
import { generarCsvDrogueria, descargarArchivoCsv } from '../services/csvExportEngine';
import { 
  Download, 
  FileText, 
  Check, 
  Copy, 
  Code2, 
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface DrugstoreCsvTabProps {
  droguerias: Drogueria[];
  pedidosCabecera: PedidoCabecera[];
  pedidosDetalle: PedidoDetalle[];
  clientes: Cliente[];
  productos: Producto[];
}

export const DrugstoreCsvTab: React.FC<DrugstoreCsvTabProps> = ({
  droguerias,
  pedidosCabecera,
  pedidosDetalle,
  clientes,
  productos,
}) => {
  const { esClaro } = useTheme();
  const [drogueriaActivaId, setDrogueriaActivaId] = useState<string>(droguerias[0]?.id || '');
  const [pedidoSeleccionadoId, setPedidoSeleccionadoId] = useState<string>(pedidosCabecera[0]?.id || '');
  const [copiado, setCopiado] = useState(false);

  const productosMap = useMemo(() => {
    const map = new Map<string, Producto>();
    productos.forEach((p) => map.set(p.id, p));
    return map;
  }, [productos]);

  const drogueriaActiva = useMemo(() => {
    return droguerias.find((d) => d.id === drogueriaActivaId) || droguerias[0];
  }, [droguerias, drogueriaActivaId]);

  const pedidoActual = useMemo(() => {
    return pedidosCabecera.find((p) => p.id === pedidoSeleccionadoId) || pedidosCabecera[0];
  }, [pedidosCabecera, pedidoSeleccionadoId]);

  const clienteActual = useMemo(() => {
    if (!pedidoActual) return clientes[0];
    return clientes.find((c) => c.id === pedidoActual.cliente_id) || clientes[0];
  }, [clientes, pedidoActual]);

  const detallesActuales = useMemo(() => {
    if (!pedidoActual) return [];
    return pedidosDetalle.filter((d) => d.pedido_id === pedidoActual.id);
  }, [pedidosDetalle, pedidoActual]);

  const csvGenerado = useMemo(() => {
    if (!pedidoActual || !drogueriaActiva || !clienteActual) return null;
    return generarCsvDrogueria(pedidoActual, detallesActuales, clienteActual, drogueriaActiva, productosMap);
  }, [pedidoActual, detallesActuales, clienteActual, drogueriaActiva, productosMap]);

  const handleCopiarCsv = () => {
    if (!csvGenerado) return;
    navigator.clipboard.writeText(csvGenerado.content);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const handleDescargarCsv = () => {
    if (!csvGenerado) return;
    descargarArchivoCsv(csvGenerado);
  };

  return (
    <div className="space-y-5">

      {/* Cabecera Limpia */}
      <div className={`p-5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
        esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800 shadow-lg'
      }`}>
        <div>
          <h2 className={`text-xl font-bold ${esClaro ? 'text-slate-900' : 'text-white'}`}>
            Formatos & Exportación CSV por Droguería
          </h2>
          <p className={`text-xs mt-0.5 ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
            Cada distribuidor exige un layout distinto. El motor interpreta el JSONB de configuración y genera el archivo exacto.
          </p>
        </div>

        {csvGenerado && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopiarCsv}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                esClaro ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200' : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
              }`}
            >
              {copiado ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiado ? 'Copiado' : 'Copiar Texto'}</span>
            </button>
            <button
              onClick={handleDescargarCsv}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Descargar CSV</span>
            </button>
          </div>
        )}
      </div>

      {/* Selector de Droguerías */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {droguerias.map((drog) => {
          const isActiva = drog.id === drogueriaActivaId;
          const config = drog.formato_csv_config;
          return (
            <button
              key={drog.id}
              onClick={() => setDrogueriaActivaId(drog.id)}
              className={`p-4 rounded-xl border text-left transition-all ${
                isActiva
                  ? esClaro
                    ? 'bg-teal-50/60 border-teal-600 ring-1 ring-teal-600 shadow-sm'
                    : 'bg-slate-800 border-teal-500 ring-1 ring-teal-500/50 shadow-md'
                  : esClaro
                  ? 'bg-white border-slate-200 hover:bg-slate-50'
                  : 'bg-slate-900 border-slate-800 hover:bg-slate-800'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={`text-xs font-bold block ${esClaro ? 'text-slate-900' : 'text-white'}`}>
                  {drog.nombre_drogueria}
                </span>
                {isActiva && (
                  <span className="w-2 h-2 rounded-full bg-teal-600 shrink-0" />
                )}
              </div>

              <span className={`text-[11px] font-mono block mt-0.5 ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
                RIF: {drog.rif}
              </span>

              <div className={`mt-3 pt-2 border-t flex items-center justify-between text-[11px] ${
                esClaro ? 'border-slate-100 text-slate-600' : 'border-slate-800 text-slate-300'
              }`}>
                <span>
                  Delim: <code className="font-bold font-mono">'{config.delimitador === '\t' ? '\\t' : config.delimitador}'</code>
                </span>
                <span>
                  Dec: <code className="font-mono">{config.formato_decimal}</code>
                </span>
                <span>
                  {config.columnas.length} cols
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Zona de Trabajo: Layout Config JSONB vs Resultado Generado en Vivo */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* Especificación del Layout */}
        <div className="lg:col-span-5 space-y-4">
          <div className={`p-4 rounded-2xl border space-y-4 shadow-sm ${
            esClaro ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            
            <div className={`flex items-center justify-between border-b pb-3 ${
              esClaro ? 'border-slate-100' : 'border-slate-800'
            }`}>
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <h3 className={`text-xs font-bold uppercase tracking-wider ${esClaro ? 'text-slate-900' : 'text-white'}`}>
                  Reglas de {drogueriaActiva.nombre_drogueria}
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className={`p-2.5 rounded-lg border ${
                esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <span className={`text-[10px] block ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>Delimitador:</span>
                <span className="font-mono font-bold text-teal-600 dark:text-teal-400">
                  {drogueriaActiva.formato_csv_config.delimitador === '\t' ? 'Tabulador (\\t)' : `"${drogueriaActiva.formato_csv_config.delimitador}"`}
                </span>
              </div>

              <div className={`p-2.5 rounded-lg border ${
                esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <span className={`text-[10px] block ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>Encabezados:</span>
                <span className="font-bold">
                  {drogueriaActiva.formato_csv_config.incluir_encabezados ? 'Sí (Fila 1)' : 'No (Solo datos)'}
                </span>
              </div>

              <div className={`p-2.5 rounded-lg border ${
                esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <span className={`text-[10px] block ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>Entrecomillado:</span>
                <span className="font-mono text-amber-700 dark:text-amber-400">
                  {drogueriaActiva.formato_csv_config.entrecomillado}
                </span>
              </div>

              <div className={`p-2.5 rounded-lg border ${
                esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <span className={`text-[10px] block ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>Decimales:</span>
                <span className="font-mono text-teal-600 dark:text-teal-400">
                  {drogueriaActiva.formato_csv_config.formato_decimal === 'coma' ? 'Coma (12,50)' : 'Punto (12.50)'}
                </span>
              </div>
            </div>

            <div>
              <span className={`text-xs font-bold block mb-2 ${esClaro ? 'text-slate-700' : 'text-slate-300'}`}>
                Columnas Ordenadas ({drogueriaActiva.formato_csv_config.columnas.length})
              </span>
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {drogueriaActiva.formato_csv_config.columnas
                  .sort((a, b) => a.orden - b.orden)
                  .map((col) => (
                    <div
                      key={col.orden}
                      className={`flex items-center justify-between p-2 rounded-lg border text-xs ${
                        esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${
                          esClaro ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {col.orden}
                        </span>
                        <div>
                          <span className={`font-mono font-bold ${esClaro ? 'text-slate-900' : 'text-white'}`}>
                            {col.nombre_encabezado}
                          </span>
                          <span className={`text-[10px] block ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
                            {col.campo_origen}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800">
                        {col.formato || 'texto'}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

          </div>
        </div>

        {/* Vista Previa de Archivo */}
        <div className="lg:col-span-7 space-y-4">
          
          <div className={`p-4 rounded-2xl border space-y-2 shadow-sm ${
            esClaro ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            <label className={`block text-xs font-bold uppercase tracking-wider ${
              esClaro ? 'text-slate-600' : 'text-slate-300'
            }`}>
              Seleccionar Pedido para Previsualización
            </label>
            <select
              value={pedidoSeleccionadoId}
              onChange={(e) => setPedidoSeleccionadoId(e.target.value)}
              className={`w-full text-xs rounded-xl p-2 border focus:outline-none focus:ring-1 focus:ring-teal-500 ${
                esClaro 
                  ? 'bg-slate-50 border-slate-200 text-slate-900' 
                  : 'bg-slate-950 border-slate-700 text-white'
              }`}
            >
              {pedidosCabecera.map((ped) => {
                const cli = clientes.find((c) => c.id === ped.cliente_id || c.ident01 === ped.cliente_id);
                return (
                  <option key={ped.id} value={ped.id}>
                    {ped.numero_pedido} • {cli?.nombre_fantasia || cli?.nombre_comercial || cli?.razon_social || 'Farmacia'} ({ped.estado})
                  </option>
                );
              })}
            </select>
          </div>

          <div className={`rounded-2xl border overflow-hidden shadow-sm ${
            esClaro ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'
          }`}>
            <div className={`px-4 py-2.5 border-b flex items-center justify-between ${
              esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span className={`text-xs font-mono font-bold ${esClaro ? 'text-slate-900' : 'text-white'}`}>
                  {csvGenerado?.filename || 'transfer.csv'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopiarCsv}
                  className={`text-xs px-2.5 py-1 rounded transition-colors ${
                    esClaro ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                  }`}
                >
                  {copiado ? 'Copiado' : 'Copiar'}
                </button>
                <button
                  onClick={handleDescargarCsv}
                  className="text-xs font-bold text-white px-3 py-1 rounded bg-teal-600 hover:bg-teal-700 transition-colors"
                >
                  Descargar
                </button>
              </div>
            </div>

            <div className={`p-4 overflow-x-auto max-h-72 font-mono text-xs leading-relaxed whitespace-pre ${
              esClaro ? 'bg-slate-50 text-emerald-800' : 'bg-slate-950 text-emerald-400'
            }`}>
              {csvGenerado?.content}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
