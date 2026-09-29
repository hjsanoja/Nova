import React from 'react';
import { NovaLogo } from './NovaLogo';
import { useTheme } from '../context/ThemeContext';
import { 
  X, 
  Code, 
  Lightbulb, 
  Database, 
  GitBranch, 
  CheckCircle2,
} from 'lucide-react';

interface AboutModalProps {
  abierto: boolean;
  onCerrar: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ abierto, onCerrar }) => {
  const { esClaro } = useTheme();

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
      <div 
        className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col transition-all ${
          esClaro ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800 text-slate-100'
        }`}
      >
        {/* Cabecera con degradado sutil */}
        <div className="relative p-6 bg-gradient-to-br from-slate-900 via-slate-850 to-teal-950 text-white border-b border-slate-800">
          <button
            onClick={onCerrar}
            className="absolute top-4 right-4 p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>

          <NovaLogo size="lg" esClaro={false} />
          
          <div className="mt-3 flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-teal-500/20 text-teal-300 border border-teal-500/40">
              v2.0.0
            </span>
            <span className="text-xs text-slate-400">
              Plataforma Comercial & Teletransferencia Farmacéutica
            </span>
          </div>
        </div>

        {/* Contenido de Créditos y Especificaciones */}
        <div className="p-6 space-y-5 text-sm overflow-y-auto max-h-[70vh]">
          
          {/* Créditos de Equipo */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Equipo Responsable del Proyecto
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Desarrollador & Administrador */}
              <div className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/60 border-slate-700/60'
              }`}>
                <div className="p-2 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 shrink-0">
                  <Code className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-400">Desarrollo & Administración</p>
                  <p className="font-bold text-sm text-slate-900 dark:text-white truncate">
                    Hernando Sanoja
                  </p>
                  <p className="text-[11px] text-teal-600 dark:text-teal-400 font-medium">
                    Lead Developer & Admin
                  </p>
                </div>
              </div>

              {/* Product Owner & Idea Base */}
              <div className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/60 border-slate-700/60'
              }`}>
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
                  <Lightbulb className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-400">Concepción & Visión</p>
                  <p className="font-bold text-sm text-slate-900 dark:text-white truncate">
                    Dubrasli Fajardo
                  </p>
                  <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                    Product Owner (Idea Base)
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Módulos Principales de Nova */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Arquitectura de Negocio Farmacéutico
            </h4>

            <div className={`p-4 rounded-xl border space-y-2 ${
              esClaro ? 'bg-slate-50/70 border-slate-200' : 'bg-slate-800/40 border-slate-800'
            }`}>
              <div className="flex items-center gap-2 text-xs font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span><strong>Fuerza de Ventas:</strong> Equipos La Santé, Comercial y OTC con portafolios y clientes asignados.</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span><strong>Teletransferencia:</strong> Recepción, exportación CSV multi-droguería y conciliación de unidades facturadas.</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span><strong>Motor de Sugeridos:</strong> Cálculo de demanda a 30/60/90 días consolidando compras de todos los equipos.</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span><strong>Seguridad RBAC:</strong> Perfiles segregados (Admin, Gerente, Vendedores y Teletransferencistas).</span>
              </div>
            </div>
          </div>

          {/* Infraestructura y Despliegue */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-teal-600" />
              Supabase PostgreSQL
            </span>
            <span className="flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5 text-slate-500" />
              GitHub Pages SPA
            </span>
            <span className="font-mono text-[11px]">
              Build 2026.3
            </span>
          </div>

        </div>

        {/* Footer Modal */}
        <div className={`p-4 border-t flex justify-end ${
          esClaro ? 'bg-slate-50 border-slate-200' : 'bg-slate-850 border-slate-800'
        }`}>
          <button
            onClick={onCerrar}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-500 text-white shadow-xs transition-colors"
          >
            Entendido
          </button>
        </div>

      </div>
    </div>
  );
};
