import React, { useState, useMemo } from 'react';
import { Drogueria, Producto } from '../types/pharmacy';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  Check, 
  Database, 
  Sparkles, 
  Building2,
  FileText
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface DrugstoreInventoryUploadTabProps {
  droguerias: Drogueria[];
  productos: Producto[];
  onActualizarInventarioDrogueria: (
    drogueriaId: string,
    registros: { sku: string; stock: number; precioDrogueria?: number; codigoArticuloDrogueria?: string }[]
  ) => void;
}

export const DrugstoreInventoryUploadTab: React.FC<DrugstoreInventoryUploadTabProps> = ({
  droguerias,
  productos,
  onActualizarInventarioDrogueria,
}) => {
  const { esClaro } = useTheme();
  const [drogueriaSeleccionadaId, setDrogueriaSeleccionadaId] = useState<string>(droguerias[0]?.id || '');
  const [archivoTexto, setArchivoTexto] = useState<string>('');
  const [nombreArchivo, setNombreArchivo] = useState<string>('');
  const [filasMapeadas, setFilasMapeadas] = useState<{
    sku: string;
    nombre: string;
    stock: number;
    precioDrogueria?: number;
    codigoDrogueria?: string;
    estado: 'valido' | 'no_encontrado';
  }[]>([]);
  const [notificacion, setNotificacion] = useState<string | null>(null);

  const drogueriaActual = useMemo(() => {
    return droguerias.find((d) => d.id === drogueriaSeleccionadaId) || droguerias[0];
  }, [droguerias, drogueriaSeleccionadaId]);

  const handleCargarEjemplo = () => {
    const ejemploCsv = `SKU;CODIGO_DROGUERIA;STOCK_DISPONIBLE;PRECIO_DROGUERIA
SKU-LOS-50;COB-1001;850;4.65
SKU-ATO-20;COB-1002;420;6.30
SKU-AMX-500;COB-1003;310;8.75
SKU-ACE-500;COB-1004;2100;2.15
SKU-IBU-400;COB-1005;950;2.95
SKU-OME-20;COB-1006;600;5.00`;

    setNombreArchivo(`INVENTARIO_${drogueriaActual.codigo_drogueria}_2026.csv`);
    procesarContenidoCsv(ejemploCsv);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setNombreArchivo(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      procesarContenidoCsv(text);
    };
    reader.readAsText(file);
  };

  const procesarContenidoCsv = (csv: string) => {
    setArchivoTexto(csv);
    const lineas = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lineas.length <= 1) return;

    const primeraLinea = lineas[0];
    const delimitador = primeraLinea.includes(';') ? ';' : primeraLinea.includes('\t') ? '\t' : ',';

    const filas: typeof filasMapeadas = [];

    for (let i = 1; i < lineas.length; i++) {
      const cols = lineas[i].split(delimitador).map((c) => c.replace(/["']/g, '').trim());
      if (cols.length < 2) continue;

      const sku = cols[0];
      const codDrog = cols[1];
      const stock = parseInt(cols[2]) || 0;
      const precio = parseFloat(cols[3]?.replace(',', '.')) || undefined;

      const match = productos.find(
        (p) =>
          ((p.sku || p.codigo || '').toLowerCase() === (sku || '').toLowerCase()) ||
          (p.codigo_barras_ean13 && p.codigo_barras_ean13 === sku) ||
          (p.pack_code && p.pack_code === sku)
      );

      filas.push({
        sku,
        nombre: match ? (match.product || match.nombre_comercial || 'Medicamento') : 'SKU no registrado en vademécum',
        stock,
        precioDrogueria: precio,
        codigoDrogueria: codDrog,
        estado: match ? 'valido' : 'no_encontrado',
      });
    }

    setFilasMapeadas(filas);
  };

  const handleProcesarCarga = () => {
    if (filasMapeadas.length === 0) return;

    const validos = filasMapeadas
      .filter((f) => f.estado === 'valido')
      .map((f) => ({
        sku: f.sku,
        stock: f.stock,
        precioDrogueria: f.precioDrogueria,
        codigoArticuloDrogueria: f.codigoDrogueria,
      }));

    onActualizarInventarioDrogueria(drogueriaSeleccionadaId, validos);
    setNotificacion(`¡Se actualizaron con éxito ${validos.length} medicamentos para ${drogueriaActual.nombre_drogueria}!`);
    setFilasMapeadas([]);
    setArchivoTexto('');
    setNombreArchivo('');
    setTimeout(() => setNotificacion(null), 4000);
  };

  return (
    <div className="space-y-5">

      {/* Cabecera Limpia */}
      <div className={`p-5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
        esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800 shadow-lg'
      }`}>
        <div>
          <h2 className={`text-xl font-bold ${esClaro ? 'text-slate-900' : 'text-white'}`}>
            Carga de Inventario por Droguería
          </h2>
          <p className={`text-xs mt-0.5 ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
            Actualiza el stock disponible en cada centro de distribución para validar quiebres de teletransferencia.
          </p>
        </div>

        <button
          onClick={handleCargarEjemplo}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
            esClaro 
              ? 'bg-slate-50 hover:bg-slate-100 text-teal-700 border-slate-200' 
              : 'bg-slate-800 hover:bg-slate-700 text-teal-300 border-slate-700'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
          <span>Cargar Ejemplo CSV</span>
        </button>
      </div>

      {notificacion && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>{notificacion}</span>
        </div>
      )}

      {/* Selector de Droguería y Subida de Archivo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Selector de Droguería */}
        <div className={`p-4 rounded-2xl border space-y-2 ${
          esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
        }`}>
          <label className={`block text-xs font-bold uppercase tracking-wider ${
            esClaro ? 'text-slate-600' : 'text-slate-300'
          }`}>
            Droguería Destino
          </label>
          <select
            value={drogueriaSeleccionadaId}
            onChange={(e) => setDrogueriaSeleccionadaId(e.target.value)}
            className={`w-full text-xs font-medium rounded-xl p-2.5 border focus:outline-none focus:ring-1 focus:ring-teal-500 ${
              esClaro 
                ? 'bg-slate-50 border-slate-200 text-slate-900' 
                : 'bg-slate-950 border-slate-700 text-white'
            }`}
          >
            {droguerias.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre_drogueria} ({d.rif})
              </option>
            ))}
          </select>
          <p className={`text-[11px] ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
            El inventario cargado actualizará el stock reportado por este distribuidor.
          </p>
        </div>

        {/* Zona de Drop / Carga de Archivo */}
        <div className={`md:col-span-2 border border-dashed rounded-2xl p-6 text-center transition-colors flex flex-col items-center justify-center relative ${
          esClaro 
            ? 'bg-white border-slate-300 hover:border-teal-600' 
            : 'bg-slate-900 border-slate-700 hover:border-teal-500/50'
        }`}>
          <input
            type="file"
            accept=".csv,.txt"
            onChange={handleFileUpload}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
          <UploadCloud className="w-9 h-9 text-teal-600 dark:text-teal-400 mb-2" />
          <span className={`text-xs font-bold block ${esClaro ? 'text-slate-800' : 'text-white'}`}>
            {nombreArchivo ? nombreArchivo : 'Selecciona o arrastra el archivo CSV de inventario'}
          </span>
          <span className={`text-[11px] mt-1 ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
            Formato: SKU;CODIGO_DROGUERIA;STOCK_DISPONIBLE;PRECIO_DROGUERIA
          </span>
        </div>

      </div>

      {/* Previsualización */}
      {filasMapeadas.length > 0 && (
        <div className={`rounded-2xl border overflow-hidden shadow-sm space-y-3 ${
          esClaro ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
        }`}>
          <div className={`px-4 py-3 border-b flex items-center justify-between ${
            esClaro ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-800/80 border-slate-800'
          }`}>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <h3 className={`text-xs font-bold uppercase tracking-wider ${esClaro ? 'text-slate-900' : 'text-white'}`}>
                Registros a Cargar ({filasMapeadas.length})
              </h3>
            </div>

            <button
              onClick={handleProcesarCarga}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white transition-all shadow-sm"
            >
              <Check className="w-4 h-4" />
              Confirmar Carga Masiva
            </button>
          </div>

          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-left text-xs">
              <thead className={`border-b text-[11px] uppercase tracking-wider font-semibold ${
                esClaro ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-slate-950 text-slate-400 border-slate-800'
              }`}>
                <tr>
                  <th className="py-2.5 px-3">Estado</th>
                  <th className="py-2.5 px-3">SKU</th>
                  <th className="py-2.5 px-3">Medicamento Vademécum</th>
                  <th className="py-2.5 px-3 text-center">Cód. Droguería</th>
                  <th className="py-2.5 px-3 text-center">Stock</th>
                </tr>
              </thead>
              <tbody className={`divide-y font-normal ${
                esClaro ? 'divide-slate-200 text-slate-700' : 'divide-slate-800 text-slate-300'
              }`}>
                {filasMapeadas.map((f, idx) => (
                  <tr key={idx} className={esClaro ? 'hover:bg-slate-50' : 'hover:bg-slate-800/30'}>
                    <td className="py-2.5 px-3">
                      {f.estado === 'valido' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                          Válido
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/15 text-red-700 dark:text-red-400">
                          No registrado
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold">{f.sku}</td>
                    <td className="py-2.5 px-3">{f.nombre}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-400">{f.codigoDrogueria || '-'}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-teal-600 dark:text-teal-400 font-mono">{f.stock} uds</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Esquema SQL de Referencia */}
      <div className={`p-4 rounded-2xl border space-y-2 ${
        esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
      }`}>
        <div className={`flex items-center gap-2 text-xs font-bold ${esClaro ? 'text-slate-700' : 'text-slate-300'}`}>
          <Database className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <span>Estructura de Base de Datos para Droguerías (<code className="font-mono text-teal-600 dark:text-teal-400">inventario_drogueria</code>)</span>
        </div>
        <p className={`text-[11px] ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
          Tabla provisionada en PostgreSQL / Supabase para mantener la disponibilidad por centro logístico de forma independiente al catálogo maestro.
        </p>
      </div>

    </div>
  );
};
