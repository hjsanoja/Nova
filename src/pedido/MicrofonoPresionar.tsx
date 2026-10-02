import { Mic } from 'lucide-react';

/** Alturas base de las barras de la onda (simétrica, más alta al centro). */
const BARRAS = [0.35, 0.55, 0.8, 1, 0.8, 0.55, 0.35];

/**
 * Micrófono de "presionar para hablar": escucha solo mientras se mantiene presionado (dedo, mouse o la barra
 * espaciadora). Mientras escucha, una onda animada y un anillo lo indican; la onda crece cuando se detecta voz.
 */
export function MicrofonoPresionar({ escuchando, hablando, onPresionar, onSoltar }: { escuchando: boolean; hablando: boolean; onPresionar: () => void; onSoltar: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex h-24 w-24 items-center justify-center sm:h-28 sm:w-28">
        {escuchando && (
          <>
            <span aria-hidden className="absolute inset-2 rounded-full bg-rose-500/40 motion-safe:animate-nova-anillo" />
            <span aria-hidden className="absolute inset-2 rounded-full bg-rose-500/30 motion-safe:animate-nova-anillo [animation-delay:0.8s]" />
          </>
        )}
        <button
          type="button"
          aria-label={escuchando ? 'Escuchando: suelta para terminar' : 'Mantén presionado para hablar'}
          aria-pressed={escuchando}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            onPresionar();
          }}
          onPointerUp={onSoltar}
          onPointerCancel={onSoltar}
          onLostPointerCapture={onSoltar}
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
              e.preventDefault();
              onPresionar();
            }
          }}
          onKeyUp={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              onSoltar();
            }
          }}
          onBlur={onSoltar}
          onContextMenu={(e) => e.preventDefault()}
          style={{ touchAction: 'none', WebkitTouchCallout: 'none' }}
          className={`relative inline-flex h-20 w-20 select-none items-center justify-center rounded-full text-white shadow-elevada transition-transform duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-marca-300 sm:h-24 sm:w-24 ${escuchando ? 'scale-110 bg-rose-700' : 'bg-marca-700 hover:bg-marca-800 active:scale-95'}`}
        >
          <Mic className="h-8 w-8" aria-hidden />
        </button>
      </div>
      <div aria-hidden className={`flex h-10 items-center gap-1.5 transition-opacity ${escuchando ? 'opacity-100' : 'opacity-0'}`}>
        {BARRAS.map((h, i) => (
          <span
            key={i}
            className="w-1.5 origin-center rounded-full bg-rose-600 motion-safe:animate-nova-onda dark:bg-rose-400"
            style={{ height: `${Math.round((hablando ? 40 : 16) * h)}px`, animationDelay: `${i * 0.11}s`, animationDuration: hablando ? '0.6s' : '1.2s', transition: 'height 0.2s ease' }}
          />
        ))}
      </div>
      <p role="status" aria-live="polite" className={`text-sm font-semibold ${escuchando ? 'text-rose-700 dark:text-rose-300' : 'text-slate-700 dark:text-slate-200'}`}>
        {escuchando ? (hablando ? 'Escuchando… suelta al terminar' : 'Escuchando… habla ahora') : 'Mantén presionado para hablar'}
      </p>
    </div>
  );
}
