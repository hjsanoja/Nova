import React, { useState } from 'react';
import { Copy, Check, Download, FileCode2, ExternalLink, AlertTriangle } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
// Se importan aquí (pestaña perezosa) para que los scripts no viajen en el bundle inicial.
import sqlEsquema from '../sql/nova_produccion_v3.sql?raw';
import sqlArchivar from '../sql/migracion/1_archivar_esquema_anterior.sql?raw';
import sqlMigrar from '../sql/migracion/2_migrar_datos_anteriores.sql?raw';

interface Script {
  id: string;
  paso: string;
  titulo: string;
  archivo: string;
  descripcion: string;
  contenido: string;
}

const SCRIPTS: Script[] = [
  {
    id: 'archivar',
    paso: '1',
    titulo: 'Archivar el esquema anterior',
    archivo: '1_archivar_esquema_anterior.sql',
    descripcion: 'Solo si tu proyecto ya tiene la versión anterior (dim_clientes con ident01). Mueve esas tablas al esquema "legacy" sin borrar nada.',
    contenido: sqlArchivar,
  },
  {
    id: 'esquema',
    paso: '2',
    titulo: 'Esquema NOVA v3',
    archivo: 'nova_produccion_v3.sql',
    descripcion: 'Crea (o actualiza) todas las tablas, relaciones, reglas de seguridad y funciones. Se puede ejecutar más de una vez.',
    contenido: sqlEsquema,
  },
  {
    id: 'migrar',
    paso: '3',
    titulo: 'Migrar datos anteriores',
    archivo: '2_migrar_datos_anteriores.sql',
    descripcion: 'Solo si hiciste el paso 1: copia usuarios, droguerías, productos, farmacias, homologaciones y ventas al modelo v3 y las enlaza.',
    contenido: sqlMigrar,
  },
];

export const SqlStudioTab: React.FC = () => {
  const { esClaro } = useTheme();
  const [activo, setActivo] = useState('esquema');
  const [copiado, setCopiado] = useState(false);
  const script = SCRIPTS.find((s) => s.id === activo) ?? SCRIPTS[1];

  const handleCopiar = () => {
    void navigator.clipboard.writeText(script.contenido);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  const handleDescargar = () => {
    const blob = new Blob([script.contenido], { type: 'text/sql;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = script.archivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const tarjeta = esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800 shadow-lg';

  return (
    <div className="space-y-5">
      <div className={`p-5 rounded-2xl border transition-all ${tarjeta}`}>
        <h2 className={`text-xl font-bold ${esClaro ? 'text-slate-900' : 'text-white'}`}>Base de datos en Supabase</h2>
        <p className={`text-xs mt-0.5 ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
          Ejecuta los scripts en el SQL Editor de Supabase, en orden. Proyecto nuevo: solo el paso 2. Proyecto con la versión anterior: pasos 1, 2 y 3.
        </p>
        <div className={`mt-3 p-3 rounded-xl border text-xs flex items-start gap-2.5 ${esClaro ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-950/30 border-amber-900 text-amber-200'}`}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            No ejecutes el paso 2 sobre un proyecto que aún tiene el esquema anterior sin hacer antes el paso 1: comparten nombres de tabla con
            estructura distinta. Después del paso 3, promueve tu usuario como administrador (ver la guía de arquitectura) e inicia sesión en la app.
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {SCRIPTS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActivo(s.id)}
            className={`text-left p-3 rounded-2xl border transition-colors min-h-11 ${
              activo === s.id
                ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/40'
                : esClaro ? 'border-slate-200 bg-white hover:bg-slate-50' : 'border-slate-800 bg-slate-900 hover:bg-slate-800'
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wide text-teal-600 dark:text-teal-400">Paso {s.paso}</span>
            <span className={`block text-sm font-bold ${esClaro ? 'text-slate-900' : 'text-white'}`}>{s.titulo}</span>
            <span className={`block text-[11px] mt-0.5 ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>{s.descripcion}</span>
          </button>
        ))}
      </div>

      <div className={`rounded-2xl border overflow-hidden ${esClaro ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
        <div className={`px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 ${esClaro ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-900 border-slate-800 text-slate-300'}`}>
          <div className="flex items-center gap-2 min-w-0">
            <FileCode2 className="w-4 h-4 shrink-0 text-teal-600 dark:text-teal-400" />
            <span className="text-xs font-mono font-bold truncate">{script.archivo}</span>
            <span className="text-[11px] text-slate-400 font-mono">({script.contenido.split('\n').length} líneas)</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleCopiar}
              className={`min-h-9 flex items-center gap-1.5 px-3 rounded-xl font-bold text-xs transition-all shadow-sm ${copiado ? 'bg-emerald-600 text-white' : 'bg-teal-600 hover:bg-teal-700 text-white'}`}
            >
              {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiado ? '¡Copiado!' : 'Copiar script'}</span>
            </button>
            <button
              onClick={handleDescargar}
              className={`min-h-9 flex items-center gap-1.5 px-3 rounded-xl font-semibold text-xs border transition-colors ${esClaro ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'}`}
            >
              <Download className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>Descargar .sql</span>
            </button>
            <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1">
              <span>SQL Editor</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        <div className={`p-4 overflow-auto max-h-[550px] font-mono text-xs leading-relaxed ${esClaro ? 'bg-slate-50 text-slate-800' : 'bg-slate-950 text-slate-300'}`}>
          <pre>
            <code>{script.contenido}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
