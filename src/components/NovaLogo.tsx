import React from 'react';

interface NovaLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  className?: string;
  esClaro?: boolean;
}

export const NovaLogo: React.FC<NovaLogoProps> = ({
  size = 'md',
  showTagline = true,
  className = '',
  esClaro = true,
}) => {
  const iconSize = size === 'sm' ? 28 : size === 'lg' ? 44 : 34;

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Símbolo Nova: Estrella geométrica médica con destello estelar y cruz clínica */}
      <div 
        className="relative shrink-0 flex items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 via-sky-600 to-indigo-700 shadow-md shadow-teal-600/20 text-white"
        style={{ width: iconSize, height: iconSize }}
      >
        <svg
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full p-1.5"
        >
          {/* Estrella Nova de 4 puntas estilizada */}
          <path
            d="M20 2C20.6 11 29 19.4 38 20C29 20.6 20.6 29 20 38C19.4 29 11 20.6 2 20C11 19.4 19.4 11 20 2Z"
            fill="currentColor"
            fillOpacity="0.95"
          />
          {/* Núcleo de Destello / Cruz Médica */}
          <circle cx="20" cy="20" r="4.5" fill="#ffffff" />
          <path
            d="M20 14V26M14 20H26"
            stroke="#001428"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* Destellos diagonales menores */}
          <circle cx="29" cy="11" r="1.5" fill="#ffffff" fillOpacity="0.8" />
          <circle cx="11" cy="29" r="1.5" fill="#ffffff" fillOpacity="0.8" />
        </svg>
      </div>

      {/* Tipografía Nova */}
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1.5">
          <span 
            className={`font-display font-extrabold tracking-tight leading-none ${
              size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-xl'
            } ${esClaro ? 'text-[#001428]' : 'text-white'}`}
          >
            NOVA
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></span>
        </div>
        {showTagline && (
          <span 
            className={`text-[10px] font-medium tracking-wide truncate ${
              esClaro ? 'text-slate-500' : 'text-slate-400'
            }`}
          >
            Comercial & Teletransferencia
          </span>
        )}
      </div>
    </div>
  );
};
