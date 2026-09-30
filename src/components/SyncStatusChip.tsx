import React from 'react';
import { useEstadoSync } from '../offline/syncStore';

/**
 * Indicador no invasivo del estado de sincronización (módulo A.4):
 *   verde = conectado · ámbar = sin conexión (N cambios guardados en el dispositivo) · azul = sincronizando.
 * Solo depende del store liviano; Dexie y el motor se cargan aparte.
 */
export const SyncStatusChip: React.FC<{ onAbrirConfig?: () => void }> = ({ onAbrirConfig }) => {
  const s = useEstadoSync();

  let color = 'bg-emerald-500';
  let texto = 'Conectado';
  let tono = 'text-emerald-800 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950 dark:border-emerald-900';

  if (s.sincronizando) {
    color = 'bg-sky-500 animate-pulse';
    texto = 'Sincronizando…';
    tono = 'text-sky-800 bg-sky-50 border-sky-200 dark:text-sky-300 dark:bg-sky-950 dark:border-sky-900';
  } else if (!s.online) {
    color = 'bg-amber-500';
    texto = s.pendientes > 0 ? `Sin conexión · ${s.pendientes} guardado${s.pendientes === 1 ? '' : 's'}` : 'Sin conexión';
    tono = 'text-amber-900 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950 dark:border-amber-900';
  } else if (s.necesitaLogin) {
    color = 'bg-amber-500';
    texto = 'Sesión vencida';
    tono = 'text-amber-900 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950 dark:border-amber-900';
  } else if (!s.remotoConfigurado) {
    color = 'bg-slate-400';
    texto = s.pendientes > 0 ? `Modo local · ${s.pendientes}` : 'Modo local';
    tono = 'text-slate-700 bg-slate-100 border-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:border-slate-700';
  } else if (s.pendientes > 0) {
    texto = `Conectado · ${s.pendientes} por enviar`;
  }

  const detalle = [texto, s.errores > 0 ? `${s.errores} con error` : null].filter(Boolean).join(' · ');

  // Toda la información y las acciones (reintentar, volver a entrar) viven en Configuración > Sincronización.
  return (
    <button
      type="button"
      onClick={onAbrirConfig}
      aria-live="polite"
      title={`${detalle} — toca para ver el detalle`}
      className={`inline-flex h-9 items-center gap-2 rounded-xl border px-2.5 text-xs font-semibold ${tono}`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} aria-hidden />
      <span className="hidden sm:inline">{texto}</span>
      {s.pendientes > 0 && <span className="sm:hidden font-mono">{s.pendientes}</span>}
      {s.errores > 0 && <span className="rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">{s.errores}</span>}
    </button>
  );
};
