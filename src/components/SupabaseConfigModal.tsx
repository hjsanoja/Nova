import React, { useState, useEffect } from 'react';
import { Database, Check, AlertCircle, RefreshCw, X, ExternalLink, ShieldCheck } from 'lucide-react';
import { 
  getStoredSupabaseConfig, 
  saveSupabaseConfig, 
  clearSupabaseConfig, 
  probarConexionSupabase 
} from '../services/supabaseClient';
import { limpiarSupabaseUrl, limpiarSupabaseAnonKey } from '../services/supabaseConfig';

interface SupabaseConfigModalProps {
  abierto: boolean;
  onCerrar: () => void;
  onConexionActualizada: () => void;
}

export const SupabaseConfigModal: React.FC<SupabaseConfigModalProps> = ({
  abierto,
  onCerrar,
  onConexionActualizada,
}) => {
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [probando, setProbando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);

  useEffect(() => {
    if (abierto) {
      const config = getStoredSupabaseConfig();
      setUrl(config.url);
      setAnonKey(config.anonKey);
      setResultado(null);
    }
  }, [abierto]);

  if (!abierto) return null;

  const handleProbarYGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !anonKey.trim()) {
      setResultado({
        ok: false,
        mensaje: 'Por favor ingresa tanto la URL como la Anon Key de tu proyecto Supabase.',
      });
      return;
    }

    const cleanUrl = limpiarSupabaseUrl(url);
    const cleanKey = limpiarSupabaseAnonKey(anonKey);
    setUrl(cleanUrl);
    setAnonKey(cleanKey);

    setProbando(true);
    setResultado(null);

    // Guardar normalizado para probar
    saveSupabaseConfig(cleanUrl, cleanKey);
    const res = await probarConexionSupabase();
    setProbando(false);
    setResultado(res);

    if (res.ok) {
      onConexionActualizada();
    }
  };

  const handleRestablecerSandbox = () => {
    clearSupabaseConfig();
    setUrl('');
    setAnonKey('');
    setResultado({
      ok: true,
      mensaje: 'Modo Sandbox Local activado con datos simulados de farmacias y droguerías.',
    });
    onConexionActualizada();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
        
        {/* Cabecera del modal */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-teal-400" />
            <h3 className="text-base font-bold text-white">
              Conexión Supabase (PostgreSQL & Auth)
            </h3>
          </div>
          <button
            onClick={onCerrar}
            className="text-slate-400 hover:text-white text-lg font-bold"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          Puedes conectar tu proyecto gratuito de Supabase ingresando la URL y la Anon Key pública. 
          Si aún no lo has configurado, la plataforma opera al 100% en <b>Modo Sandbox Local</b> con toda la lógica de cálculo y exportación disponible.
        </p>

        <form onSubmit={handleProbarYGuardar} className="space-y-4 text-xs">
          
          <div>
            <label className="block text-slate-300 font-bold mb-1">
              Project URL de Supabase *
            </label>
            <input
              type="text"
              required
              placeholder="https://xyzabcdefghijklm.supabase.co"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none placeholder:text-slate-600"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Obténla en tu proyecto Supabase: <b>Project Settings → Data API → Project URL</b>. (Si pegas el link del dashboard, se corregirá automáticamente).
            </p>
          </div>

          <div>
            <label className="block text-slate-300 font-bold mb-1">
              Project Anon Key (Public) *
            </label>
            <textarea
              required
              rows={3}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none placeholder:text-slate-600"
            />
          </div>

          {/* Resultado de prueba */}
          {resultado && (
            <div className={`p-3 rounded-xl border text-xs font-semibold flex items-start gap-2 ${
              resultado.ok
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}>
              {resultado.ok ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              )}
              <span>{resultado.mensaje}</span>
            </div>
          )}

          <div className="pt-2 flex items-center justify-between border-t border-slate-800">
            <button
              type="button"
              onClick={handleRestablecerSandbox}
              className="text-xs text-amber-400 hover:text-amber-300 font-semibold"
            >
              Usar Modo Sandbox Local
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCerrar}
                className="px-3.5 py-2 rounded-xl text-slate-400 hover:text-white"
              >
                Cerrar
              </button>

              <button
                type="submit"
                disabled={probando}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-md disabled:opacity-50"
              >
                {probando ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Probando...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    Probar & Conectar
                  </>
                )}
              </button>
            </div>
          </div>

        </form>

        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
          <span className="font-bold text-slate-300 block">¿Dónde obtener estas credenciales?</span>
          <p>
            1. En <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="text-teal-400 underline inline-flex items-center gap-0.5">supabase.com <ExternalLink className="w-2.5 h-2.5" /></a> entra a tu proyecto.
          </p>
          <p>
            2. En el menú lateral ve a <b>Project Settings &rarr; API</b> y copia la <b>URL</b> y la clave <b>anon (public)</b>.
          </p>
        </div>

      </div>
    </div>
  );
};
