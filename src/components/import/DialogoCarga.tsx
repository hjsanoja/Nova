import { AlertTriangle, CheckCircle2, UploadCloud, XCircle } from 'lucide-react';
import { Boton } from '../ui/kit';
import type { Descarte } from '../../services/cargaArchivos';

/**
 * Ventana de una carga de archivo en tres pasos:
 *   1. confirmar: cuántas filas se leyeron, cuántos registros se van a cargar y qué se descarta (y por qué);
 *   2. cargando: barra de progreso por lotes y la etapa en curso;
 *   3. resultado: qué se guardó, qué se rechazó o el error exacto si no se pudo.
 */
export type EstadoCarga =
  | {
      fase: 'confirmar';
      titulo: string;
      archivo: string;
      leidas: number;
      aCargar: number;
      /** Qué es cada registro: "farmacias", "productos"... */
      unidad: string;
      descartes: Descarte[];
      repetidas: number;
      avisos?: string[];
    }
  | { fase: 'cargando'; titulo: string; hechas: number; total: number; etapa: string }
  | { fase: 'resultado'; titulo: string; ok: boolean; lineas: string[]; detalle?: string[] };

const MAX_DESCARTES_VISIBLES = 15;

export function DialogoCarga({ estado, onConfirmar, onCerrar }: { estado: EstadoCarga | null; onConfirmar: () => void; onCerrar: () => void }) {
  if (!estado) return null;
  const pct = estado.fase === 'cargando' && estado.total > 0 ? Math.min(100, Math.round((estado.hechas / estado.total) * 100)) : 0;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="dialogo-carga-titulo">
      <div className="max-h-[90dvh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-xl dark:bg-slate-900 sm:max-w-lg sm:rounded-xl">
        <h2 id="dialogo-carga-titulo" className="mb-3 flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
          {estado.fase === 'resultado' ? (
            estado.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-rose-600" />
          ) : (
            <UploadCloud className="h-5 w-5 text-marca-600" />
          )}
          {estado.titulo}
        </h2>

        {estado.fase === 'confirmar' && (
          <>
            <p className="mb-3 truncate text-xs text-slate-500" title={estado.archivo}>Archivo: {estado.archivo}</p>
            <dl className="mb-3 grid grid-cols-3 gap-2 text-center">
              <Cifra rotulo="Filas leídas" valor={estado.leidas} />
              <Cifra rotulo={`${estado.unidad} a cargar`} valor={estado.aCargar} tono="teal" />
              <Cifra rotulo="Descartadas" valor={estado.descartes.length} tono={estado.descartes.length ? 'ambar' : undefined} />
            </dl>
            {estado.repetidas > 0 && (
              <p className="mb-2 text-xs text-slate-600 dark:text-slate-300">{estado.repetidas} fila(s) repetidas en el archivo: se toma la última.</p>
            )}
            {estado.avisos?.map((a) => (
              <p key={a} className="mb-2 flex gap-1.5 text-xs text-amber-800 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{a}</p>
            ))}
            {estado.descartes.length > 0 && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <p className="mb-1 font-semibold">No se cargarán estas filas:</p>
                <ul className="space-y-0.5">
                  {estado.descartes.slice(0, MAX_DESCARTES_VISIBLES).map((d) => (
                    <li key={`${d.linea}-${d.motivo}`}>Línea {d.linea}: {d.motivo}</li>
                  ))}
                  {estado.descartes.length > MAX_DESCARTES_VISIBLES && <li>… y {estado.descartes.length - MAX_DESCARTES_VISIBLES} más.</li>}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Boton onClick={onCerrar}>Cancelar</Boton>
              <Boton variante="primario" icono={UploadCloud} disabled={estado.aCargar === 0} onClick={onConfirmar}>
                Cargar {estado.aCargar.toLocaleString()} {estado.unidad}
              </Boton>
            </div>
          </>
        )}

        {estado.fase === 'cargando' && (
          <>
            <p className="mb-2 text-sm text-slate-700 dark:text-slate-200">{estado.etapa}…</p>
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <div className="h-full rounded-full bg-marca-600 transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {estado.hechas.toLocaleString()} de {estado.total.toLocaleString()} ({pct}%). No cierres esta pestaña.
            </p>
          </>
        )}

        {estado.fase === 'resultado' && (
          <>
            <ul className="mb-3 space-y-1 text-sm text-slate-700 dark:text-slate-200">
              {estado.lineas.map((l) => <li key={l}>{l}</li>)}
            </ul>
            {estado.detalle && estado.detalle.length > 0 && (
              <ul className="mb-3 max-h-48 space-y-0.5 overflow-y-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-300">
                {estado.detalle.map((d) => <li key={d}>{d}</li>)}
              </ul>
            )}
            <div className="flex justify-end">
              <Boton variante="primario" onClick={onCerrar}>Entendido</Boton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Cifra({ rotulo, valor, tono }: { rotulo: string; valor: number; tono?: 'teal' | 'ambar' }) {
  const color = tono === 'teal' ? 'text-marca-700 dark:text-marca-300' : tono === 'ambar' ? 'text-amber-700 dark:text-amber-300' : 'text-slate-900 dark:text-white';
  return (
    <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-950">
      <dd className={`text-lg font-bold ${color}`}>{valor.toLocaleString()}</dd>
      <dt className="text-xs text-slate-500">{rotulo}</dt>
    </div>
  );
}
