import React, { useState } from 'react';
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { clearSupabaseConfig, getStoredSupabaseConfig, probarConexionSupabase, saveSupabaseConfig } from '../../services/supabaseClient';
import { diagnosticarConexion } from '../../services/diagnosticoConexion';
import { Boton, estiloInput } from '../ui/kit';

/** Conexión con el proyecto de Supabase (URL y clave pública "anon"). Se usa en el acceso inicial y en Configuración. */
export const ConexionForm: React.FC<{ onCambio: () => void; permitirQuitar?: boolean }> = ({ onCambio, permitirQuitar }) => {
  const inicial = getStoredSupabaseConfig();
  const [url, setUrl] = useState(inicial.url);
  const [clave, setClave] = useState(inicial.anonKey);
  const [probando, setProbando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !clave.trim()) return setResultado({ ok: false, mensaje: 'Escribe la URL y la clave "anon" de tu proyecto.' });
    setProbando(true);
    setResultado(null);
    // Primero se comprueba URL y clave; solo se guardan si funcionan (antes se guardaban aunque la prueba fallara).
    const diagnostico = await diagnosticarConexion(url, clave);
    if (!diagnostico.ok) {
      setProbando(false);
      return setResultado(diagnostico);
    }
    saveSupabaseConfig(url, clave);
    const r = await probarConexionSupabase();
    setProbando(false);
    setResultado(r);
    if (r.ok) onCambio();
  };

  return (
    <form onSubmit={guardar} className="space-y-3">
      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
        URL del proyecto
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" autoComplete="off" spellCheck={false} className={`${estiloInput} mt-1`} />
      </label>
      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
        Clave pública (publishable o anon)
        <input value={clave} onChange={(e) => setClave(e.target.value)} placeholder="sb_publishable_… o eyJ…" autoComplete="off" spellCheck={false} className={`${estiloInput} mt-1 font-mono text-xs`} />
      </label>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">En Supabase: botón <b>Connect</b> del proyecto, o Project Settings → Data API (URL) y API Keys (clave). Usa la clave <b>publishable</b> o <b>anon</b>; nunca la secret ni la service_role.</p>
      {resultado && (
        <p className={`flex items-start gap-1.5 rounded-xl px-3 py-2 text-xs ${resultado.ok ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200'}`}>
          {resultado.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{resultado.mensaje}</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" variante="primario" disabled={probando} icono={probando ? RefreshCw : undefined} className="flex-1">
          {probando ? 'Probando…' : 'Probar y guardar'}
        </Boton>
        {permitirQuitar && (
          <Boton
            onClick={() => {
              clearSupabaseConfig();
              setUrl('');
              setClave('');
              setResultado(null);
              onCambio();
            }}
          >
            Quitar conexión
          </Boton>
        )}
      </div>
    </form>
  );
};
