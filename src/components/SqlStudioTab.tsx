import React, { useState } from 'react';
import { Copy, Check, Download, FileCode2, ExternalLink } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
// Se importa aquí (pestaña perezosa) para que el script de ~60 KB no viaje en el bundle inicial.
import sqlContent from '../sql/supabase_schema_fase1.sql?raw';

export const SqlStudioTab: React.FC = () => {
  const { esClaro } = useTheme();
  const [copiado, setCopiado] = useState(false);

  const handleCopiar = () => {
    navigator.clipboard.writeText(sqlContent);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  const handleDescargar = () => {
    const blob = new Blob([sqlContent], { type: 'text/sql;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pharma_teletransfer_supabase_schema.sql';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      
      {/* Cabecera Limpia */}
      <div className={`p-5 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
        esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800 shadow-lg'
      }`}>
        <div>
          <h2 className={`text-xl font-bold ${esClaro ? 'text-slate-900' : 'text-white'}`}>
            Esquema DDL & Funciones Supabase PostgreSQL
          </h2>
          <p className={`text-xs mt-0.5 ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
            Definición completa de tablas, triggers reactivos de fill-rate, políticas RLS por rol y función analítica de sugeridos.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleCopiar}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs transition-all shadow-sm ${
              copiado
                ? 'bg-emerald-600 text-white'
                : 'bg-teal-600 hover:bg-teal-700 text-white'
            }`}
          >
            {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copiado ? '¡Copiado!' : 'Copiar Script SQL'}</span>
          </button>

          <button
            onClick={handleDescargar}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-semibold text-xs border transition-colors ${
              esClaro ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            <Download className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span>Descargar .sql</span>
          </button>
        </div>
      </div>

      {/* Visor de Código SQL */}
      <div className={`rounded-2xl border overflow-hidden shadow-sm ${
        esClaro ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'
      }`}>
        <div className={`px-4 py-2.5 border-b flex items-center justify-between ${
          esClaro ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-900 border-slate-800 text-slate-300'
        }`}>
          <div className="flex items-center gap-2">
            <FileCode2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span className="text-xs font-mono font-bold">
              supabase_schema_fase1.sql
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              ({sqlContent.split('\n').length} líneas)
            </span>
          </div>

          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1"
          >
            <span>Abrir SQL Editor en Supabase</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className={`p-4 overflow-x-auto max-h-[550px] font-mono text-xs leading-relaxed ${
          esClaro ? 'bg-slate-50 text-slate-800' : 'bg-slate-950 text-slate-300'
        }`}>
          <pre>
            <code>{sqlContent}</code>
          </pre>
        </div>
      </div>

    </div>
  );
};
