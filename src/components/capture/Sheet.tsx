import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface SheetProps {
  abierto: boolean;
  titulo: string;
  onCerrar: () => void;
  children: React.ReactNode;
  /** Ancho máximo en tablet/PC (clase de Tailwind). */
  ancho?: string;
}

/** Hoja inferior en móvil y diálogo centrado en tablet/PC. Bloquea el scroll del fondo y cierra con Escape. */
export const Sheet: React.FC<SheetProps> = ({ abierto, titulo, onCerrar, children, ancho = 'md:max-w-lg' }) => {
  const marca = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    // Con hojas apiladas, Escape cierra solo la de más arriba (la última abierta).
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const hojas = document.querySelectorAll('[data-hoja]');
      if (hojas[hojas.length - 1] === marca.current) onCerrar();
    };
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', alTeclear);
    return () => {
      document.body.style.overflow = previo;
      window.removeEventListener('keydown', alTeclear);
    };
  }, [abierto, onCerrar]);

  if (!abierto) return null;
  // En un portal: una hoja abierta desde otra (p. ej. una tarea desde la ficha) queda por encima y no hereda su recorte.
  return createPortal(
    <div ref={marca} data-hoja className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-slate-950/50 dark:bg-black/70" onClick={onCerrar} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`animate-in relative flex max-h-[88dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl dark:border dark:border-slate-700 dark:bg-slate-900 ${ancho} md:rounded-2xl`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className=" text-base font-bold text-slate-900 dark:text-white">{titulo}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="-m-2 inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain p-4 pb-safe">{children}</div>
      </div>
    </div>,
    document.body
  );
};
