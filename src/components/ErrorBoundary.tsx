import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleResetLocalState = () => {
    try {
      localStorage.removeItem('PHARMA_PRODUCTOS');
      localStorage.removeItem('PHARMA_DROGUERIAS_V2');
      localStorage.removeItem('PHARMA_CLIENTES');
      localStorage.removeItem('PHARMA_HISTORICO');
      localStorage.removeItem('PHARMA_PEDIDOS_CAB');
      localStorage.removeItem('PHARMA_PEDIDOS_DET');
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white">Se detectó una excepción en la vista</h2>
              <p className="text-xs text-slate-400">
                La aplicación protegió el estado de tu sesión para evitar pérdida de datos.
              </p>
            </div>

            {this.state.error?.message && (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-red-300 text-left overflow-x-auto">
                {this.state.error.message}
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={this.handleReload}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-xs bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reintentar y Recargar</span>
              </button>

              <button
                onClick={this.handleResetLocalState}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all border border-slate-700"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
                <span>Restaurar Datos Predeterminados de Fábrica</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
