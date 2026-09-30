/** Símbolo de NOVA. Es el mismo dibujo que public/icons/icon.svg (pestaña del navegador e ícono de la app instalada);
 *  aquí toma el color de la paleta elegida. */
function NovaSimbolo({ tamano = 32 }: { tamano?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={tamano} height={tamano} aria-hidden className="shrink-0">
      <rect width="40" height="40" rx="9" className="fill-marca-700" />
      <path d="M20 5c.5 8.5 6.5 14.5 15 15-8.5.5-14.5 6.5-15 15-.5-8.5-6.5-14.5-15-15 8.5-.5 14.5-6.5 15-15z" fill="#fff" />
      <circle cx="20" cy="20" r="4.6" className="fill-marca-700" />
      <path d="M20 17.4v5.2M17.4 20h5.2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function NovaLogo({ size = 'md', showTagline = true, className = '' }: { size?: 'sm' | 'md' | 'lg'; showTagline?: boolean; className?: string; esClaro?: boolean }) {
  const tamano = size === 'sm' ? 28 : size === 'lg' ? 44 : 34;
  return (
    <div className={`flex select-none items-center gap-2.5 ${className}`}>
      <NovaSimbolo tamano={tamano} />
      <div className="flex min-w-0 flex-col">
        <span className={`font-bold leading-none tracking-tight text-slate-900 dark:text-white ${size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-xl'}`}>NOVA</span>
        {showTagline && <span className={`truncate text-xs font-medium text-slate-500 dark:text-slate-400 ${size === 'sm' ? 'hidden sm:block' : ''}`}>Comercial & Teletransferencia</span>}
      </div>
    </div>
  );
}
