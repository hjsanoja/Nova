import React, { useState, useEffect, useRef } from 'react';
import { Producto, ItemDictadoReconocido } from '../types/pharmacy';
import { parsearDictadoVoz } from '../services/voiceParserEngine';
import { 
  Mic, 
  MicOff, 
  Sparkles, 
  Check, 
  X, 
  AlertCircle, 
} from 'lucide-react';

interface VoiceDictationModalProps {
  abierto: boolean;
  onCerrar: () => void;
  productos: Producto[];
  onAgregarItemsAlPedido: (items: { producto: Producto; cantidad: number; descuento: number }[]) => void;
}

export const VoiceDictationModal: React.FC<VoiceDictationModalProps> = ({
  abierto,
  onCerrar,
  productos,
  onAgregarItemsAlPedido,
}) => {
  const [escuchando, setEscuchando] = useState(false);
  const [transcripcion, setTranscripcion] = useState('');
  const [itemsReconocidos, setItemsReconocidos] = useState<ItemDictadoReconocido[]>([]);
  const [soportaVoz, setSoportaVoz] = useState(true);
  const [errorVoz, setErrorVoz] = useState<string | null>(null);

  // Referencia a la instancia de SpeechRecognition
  const recognitionRef = useRef<any>(null);
  // El catálogo se lee desde una ref para no recrear (ni dejar abierto) el reconocedor cuando cambia.
  const productosRef = useRef(productos);
  productosRef.current = productos;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'es-VE'; // Español Venezuela / América Latina

        recognition.onstart = () => {
          setEscuchando(true);
          setErrorVoz(null);
        };

        recognition.onresult = (event: any) => {
          let textoActual = '';
          for (let i = 0; i < event.results.length; i++) {
            textoActual += event.results[i][0].transcript + ' ';
          }
          setTranscripcion(textoActual.trim());
          const parseados = parsearDictadoVoz(textoActual, productosRef.current);
          setItemsReconocidos(parseados);
        };

        recognition.onerror = (event: any) => {
          console.warn('Speech recognition error:', event.error);
          if (event.error === 'not-allowed') {
            setErrorVoz('Permiso de micrófono denegado. Puedes probar con los ejemplos rápidos abajo.');
          } else {
            setErrorVoz(`Aviso de audio: ${event.error}`);
          }
          setEscuchando(false);
        };

        recognition.onend = () => {
          setEscuchando(false);
        };

        recognitionRef.current = recognition;
      } else {
        setSoportaVoz(false);
      }
    }

    // Al cerrar el modal se libera el micrófono.
    return () => {
      const activo = recognitionRef.current;
      recognitionRef.current = null;
      try {
        activo?.abort();
      } catch { /* ya detenido */ }
    };
  }, []);

  useEffect(() => {
    if (!abierto && escuchando) {
      detenerEscucha();
    }
  }, [abierto, escuchando]);

  if (!abierto) return null;

  const iniciarEscucha = () => {
    setErrorVoz(null);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.warn('Recognition start exception:', err);
      }
    }
  };

  const detenerEscucha = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        console.warn('Recognition stop exception:', err);
      }
    }
    setEscuchando(false);
  };

  const handleProbarFrase = (frase: string) => {
    setTranscripcion(frase);
    const parseados = parsearDictadoVoz(frase, productos);
    setItemsReconocidos(parseados);
  };

  const handleConfirmarAñadir = () => {
    if (itemsReconocidos.length === 0) return;
    const items = itemsReconocidos.map((it) => ({
      producto: it.producto,
      cantidad: it.cantidad,
      descuento: it.descuento,
    }));

    onAgregarItemsAlPedido(items);
    onCerrar();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-4 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400 shrink-0">
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">
                Dictado por Voz & Parser Semántico
              </h3>
              <p className="text-[11px] text-slate-400">
                Dicta las cantidades y productos en lenguaje natural (Web Speech API)
              </p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-white rounded-xl"
            aria-label="Cerrar dictado"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Botón Principal de Grabación con Pulsación */}
        <div className="flex flex-col items-center justify-center py-4 bg-slate-950/60 rounded-2xl border border-slate-800 relative overflow-hidden">
          <button
            onClick={escuchando ? detenerEscucha : iniciarEscucha}
            disabled={!soportaVoz}
            aria-label={escuchando ? 'Detener dictado' : 'Iniciar dictado'}
            className={`disabled:opacity-40 disabled:cursor-not-allowed w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all relative z-10 ${
              escuchando
                ? 'bg-red-500 text-white animate-pulse ring-8 ring-red-500/20'
                : 'bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-teal-500/20 hover:scale-105'
            }`}
          >
            {escuchando ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
          </button>

          <span className="text-xs font-bold text-slate-300 mt-3">
            {!soportaVoz
              ? 'Este navegador no soporta dictado por voz (usa Chrome o Safari). Prueba los comandos de abajo.'
              : escuchando ? 'Escuchando... habla con naturalidad' : 'Presiona para hablar'}
          </span>

          <span className="text-[11px] text-slate-500 mt-0.5">
            Ej: "Agrégate 30 de Losartán con 15 de descuento y 20 de Atamel"
          </span>
        </div>

        {/* Transcripción en Vivo */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
          <span className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-wider">
            Transcripción Reconocida:
          </span>
          <p className="text-slate-200 min-h-6 italic font-medium">
            {transcripcion ? `"${transcripcion}"` : 'Esperando dictado o selecciona una orden de prueba abajo...'}
          </p>
        </div>

        {/* Ejemplos rápidos de prueba */}
        <div>
          <span className="text-[11px] font-bold text-slate-400 block mb-1.5">
            Comandos de prueba rápida:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {[
              '30 cajas de Losartán con 15 de descuento y 10 de Atorvastatina',
              '50 unidades de Atamel y 12 de Clavumox',
              '20 cajas de Omeprazol con 10% de descuento',
              'Treinta de Ibuprofeno y cuarenta de Loratadina',
            ].map((frase, idx) => (
              <button
                key={idx}
                onClick={() => handleProbarFrase(frase)}
                className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2.5 py-1 rounded-lg border border-slate-700/60 transition-colors text-left"
              >
                "{frase}"
              </button>
            ))}
          </div>
        </div>

        {/* Error si aplica */}
        {errorVoz && (
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorVoz}</span>
          </div>
        )}

        {/* Lista de Items Extraídos por el Parser */}
        {itemsReconocidos.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-bold text-teal-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Líneas de Pedido Detectadas ({itemsReconocidos.length}):
            </span>

            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1 scrollbar-thin">
              {itemsReconocidos.map((it, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-teal-500/30 text-xs"
                >
                  <div>
                    <div className="font-bold text-white flex items-center gap-2">
                      {it.producto.nombre_comercial}
                      <span className="text-[10px] text-slate-400 font-normal">
                        ({it.producto.principio_activo})
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Laboratorio: {it.producto.laboratorio} • SKU: {it.producto.sku}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 rounded-lg bg-teal-500/20 text-teal-300 font-bold font-mono">
                      {it.cantidad} uds
                    </span>
                    {it.descuento > 0 && (
                      <span className="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-300 font-bold font-mono text-[11px]">
                        -{it.descuento}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Botones de Acción */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onCerrar}
            className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs"
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={itemsReconocidos.length === 0}
            onClick={handleConfirmarAñadir}
            className="flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-xs bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-md disabled:opacity-50 disabled:pointer-events-none transition-all"
          >
            <Check className="w-4 h-4" />
            Añadir {itemsReconocidos.length} al Pedido
          </button>
        </div>

      </div>
    </div>
  );
};
