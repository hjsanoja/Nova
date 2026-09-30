import { useState } from 'react';
import { CheckCircle2, CircleAlert, RefreshCw, Trash2 } from 'lucide-react';
import { obtenerDb } from '../../offline/db';
import { limpiarDatosLocales } from '../../offline/aislamiento';
import { reintentarAhora } from '../../offline/outbox';
import { sincronizarYa } from '../../offline/motor';
import { useEstadoSync } from '../../offline/syncStore';
import { borrarClavesLocales } from '../../hooks/usePersistentState';
import { ConexionForm } from '../../components/acceso/ConexionForm';
import { Boton, Tarjeta, useAviso } from '../../components/ui/kit';

const hora = (t: number | null) => (t ? new Date(t).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : 'todavía no');

function Fila({ rotulo, valor, tono }: { rotulo: string; valor: string; tono?: 'ok' | 'aviso' | 'error' }) {
  const color = tono === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : tono === 'aviso' ? 'text-amber-700 dark:text-amber-400' : tono === 'error' ? 'text-rose-700 dark:text-rose-400' : '';
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <dt className="text-slate-500">{rotulo}</dt>
      <dd className={`font-semibold ${color}`}>{valor}</dd>
    </div>
  );
}

/** Todo lo relacionado con la conexión y el envío/recepción de datos. Aquí se resuelven los avisos de la barra superior. */
export function Sincronizacion({ esDemo, esAdmin, onCerrarSesion, onConexionCambiada }: { esDemo: boolean; esAdmin: boolean; onCerrarSesion: () => void; onConexionCambiada: () => void }) {
  const s = useEstadoSync();
  const db = obtenerDb();
  const [ocupado, setOcupado] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const { mostrar, nodo } = useAviso();

  const correr = async (accion: () => Promise<void>, ok: string) => {
    setOcupado(true);
    try {
      await accion();
      mostrar({ tipo: 'ok', texto: ok });
    } catch (e) {
      mostrar({ tipo: 'error', texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setOcupado(false);
    }
  };

  const borrarDispositivo = async () => {
    const aviso = s.pendientes > 0 ? `Hay ${s.pendientes} cambio(s) sin enviar que se PERDERÁN. ` : '';
    if (!window.confirm(`${aviso}Se borrarán los datos guardados en este dispositivo (no los de la nube) y se volverán a descargar. ¿Continuar?`)) return;
    await limpiarDatosLocales(db);
    await borrarClavesLocales();
    window.location.reload();
  };

  return (
    <div className="space-y-3">
      {nodo}
      {s.necesitaLogin && !esDemo && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <span>Tu sesión venció. Tus cambios están a salvo en este dispositivo; vuelve a iniciar sesión para enviarlos.</span>
          <Boton onClick={onCerrarSesion}>Volver a entrar</Boton>
        </div>
      )}
      <Tarjeta>
        <dl className="divide-y divide-slate-100 dark:divide-slate-800">
          <Fila rotulo="Servidor" valor={esDemo ? 'Modo demostración (sin nube)' : 'Supabase conectado'} tono={esDemo ? 'aviso' : 'ok'} />
          <Fila rotulo="Internet" valor={s.online ? 'Con conexión' : 'Sin conexión'} tono={s.online ? 'ok' : 'aviso'} />
          <Fila rotulo="Por enviar" valor={s.pendientes === 0 ? 'Nada pendiente' : `${s.pendientes} cambio${s.pendientes === 1 ? '' : 's'}`} tono={s.pendientes > 0 ? 'aviso' : 'ok'} />
          <Fila rotulo="Con error" valor={s.errores === 0 ? 'Ninguno' : `${s.errores} (el servidor los rechazó)`} tono={s.errores > 0 ? 'error' : 'ok'} />
          <Fila rotulo="Última sincronización" valor={hora(s.ultimaSync)} />
        </dl>
        {s.ultimoError && (
          <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {s.ultimoError}
          </p>
        )}
        {!esDemo && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Boton variante="primario" icono={RefreshCw} disabled={ocupado || !s.online} onClick={() => void correr(sincronizarYa, 'Sincronizado.')}>Sincronizar ahora</Boton>
            {s.errores > 0 && <Boton disabled={ocupado} onClick={() => void correr(async () => { await reintentarAhora(db); await sincronizarYa(); }, 'Reintento enviado.')}>Reintentar los que fallaron</Boton>}
          </div>
        )}
        {esDemo && <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><CheckCircle2 className="h-4 w-4" />En demostración todo se guarda solo en este navegador.</p>}
      </Tarjeta>

      <Tarjeta>
        <p className="mb-1 text-sm font-bold">Datos de este dispositivo</p>
        <p className="mb-2 text-xs text-slate-500">Si algo no coincide con lo que ves en otro equipo, borra lo guardado aquí: se vuelve a descargar todo lo que te corresponde.</p>
        <Boton variante="peligro" icono={Trash2} onClick={() => void borrarDispositivo()}>Borrar datos de este dispositivo</Boton>
      </Tarjeta>

      {esAdmin && (
        <Tarjeta>
          <button type="button" onClick={() => setCambiando((v) => !v)} className="w-full text-left text-sm font-bold" aria-expanded={cambiando}>
            Conexión con Supabase {cambiando ? '▴' : '▾'}
          </button>
          {cambiando && (
            <div className="mt-3">
              <ConexionForm permitirQuitar onCambio={onConexionCambiada} />
            </div>
          )}
        </Tarjeta>
      )}
    </div>
  );
}
