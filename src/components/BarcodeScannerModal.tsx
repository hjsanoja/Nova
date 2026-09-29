import React, { useState, useEffect, useRef } from 'react';
import { Producto } from '../types/pharmacy';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { 
  Camera, 
  CameraOff, 
  Barcode, 
  Check, 
  X, 
  AlertTriangle, 
  Plus, 
  Sparkles,
  Package
} from 'lucide-react';

interface BarcodeScannerModalProps {
  abierto: boolean;
  onCerrar: () => void;
  productos: Producto[];
  onProductoEscaneado: (producto: Producto, cantidad: number, descuento: number) => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  abierto,
  onCerrar,
  productos,
  onProductoEscaneado,
}) => {
  const [escaneando, setEscaneando] = useState(false);
  const [errorCamara, setErrorCamara] = useState<string | null>(null);
  const [productoDetectado, setProductoDetectado] = useState<Producto | null>(null);
  const [codigoLeido, setCodigoLeido] = useState<string>('');
  const [cantidad, setCantidad] = useState<number>(10);
  const [descuento, setDescuento] = useState<number>(0);

  const qrRegionId = 'pharma-barcode-scanner-region';
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (abierto) {
      iniciarCamara();
    } else {
      detenerCamara();
    }

    return () => {
      detenerCamara();
    };
  }, [abierto]);

  const iniciarCamara = async () => {
    setErrorCamara(null);
    setProductoDetectado(null);

    // Esperar a que el elemento DOM del visor esté presente tras el render
    await new Promise((resolve) => setTimeout(resolve, 150));
    const container = document.getElementById(qrRegionId);
    if (!container) {
      return;
    }

    try {
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode(qrRegionId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          verbose: false,
        });
      }

      if (html5QrCodeRef.current.isScanning) {
        return;
      }

      await html5QrCodeRef.current.start(
        { facingMode: 'environment' }, // Cámara trasera en móviles
        {
          fps: 10,
          qrbox: { width: 250, height: 150 },
          aspectRatio: 1.777778,
        },
        (decodedText) => {
          procesarCodigo(decodedText);
        },
        () => {
          // Ignorar frames sin código
        }
      );
      setEscaneando(true);
    } catch (err: any) {
      console.warn('Camera start error:', err);
      setErrorCamara('No se pudo acceder a la cámara o permisos denegados. Puedes ingresar o seleccionar códigos de prueba abajo.');
      setEscaneando(false);
    }
  };

  const detenerCamara = async () => {
    try {
      if (html5QrCodeRef.current) {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop().catch(() => {});
        }
        try {
          html5QrCodeRef.current.clear();
        } catch {
          // Ignorar si ya fue liberado
        }
        html5QrCodeRef.current = null;
      }
    } catch (err) {
      console.warn('Camera stop error:', err);
    } finally {
      setEscaneando(false);
    }
  };

  const procesarCodigo = (codigo: string) => {
    const limpio = (codigo || '').trim();
    if (!limpio) return;
    setCodigoLeido(limpio);

    // Buscar en el catálogo por EAN13 o SKU o código o pack_code
    const match = productos.find(
      (p) =>
        (p.codigo_barras_ean13 && p.codigo_barras_ean13 === limpio) ||
        (p.pack_code && p.pack_code === limpio) ||
        (p.sku && p.sku.toLowerCase() === limpio.toLowerCase()) ||
        (p.codigo && p.codigo.toLowerCase() === limpio.toLowerCase())
    );

    if (match) {
      setProductoDetectado(match);
      setCantidad(match.empaque_minimo || 10);
      setDescuento(Number(((match.descuento_maximo_porc || 15) * 0.75).toFixed(1)));
      // Si el navegador soporta vibración háptica
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(100);
      }
    } else {
      setErrorCamara(`Código ${limpio} no encontrado en el vademécum activo.`);
    }
  };

  const handleConfirmar = () => {
    if (!productoDetectado) return;
    onProductoEscaneado(productoDetectado, cantidad, descuento);
    setProductoDetectado(null);
    setCodigoLeido('');
    onCerrar();
  };

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400 shrink-0">
              <Barcode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">
                Lector de Código de Barras (EAN-13 / QR)
              </h3>
              <p className="text-[11px] text-slate-400">
                Escaneo nativo con la cámara del dispositivo móvil
              </p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-white rounded-xl"
            aria-label="Cerrar escáner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Visor de Cámara */}
        <div className="relative bg-slate-950 rounded-xl overflow-hidden border border-slate-800 aspect-video flex items-center justify-center">
          <div id={qrRegionId} className="w-full h-full" />

          {/* Guía visual de escaneo */}
          {escaneando && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-64 h-32 border-2 border-teal-400 rounded-lg relative overflow-hidden shadow-lg shadow-teal-500/20">
                <div className="absolute left-0 right-0 h-0.5 bg-teal-400 animate-pulse top-1/2" />
              </div>
            </div>
          )}

          {!escaneando && (
            <div className="text-center p-4">
              <CameraOff className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <p className="text-xs text-slate-400">Cámara inactiva o sin permisos.</p>
              <button
                onClick={iniciarCamara}
                className="mt-2 text-xs font-bold text-teal-400 hover:underline"
              >
                Reintentar conectar cámara
              </button>
            </div>
          )}
        </div>

        {/* Producto Detectado */}
        {productoDetectado ? (
          <div className="p-3.5 bg-teal-500/10 border border-teal-500/30 rounded-xl space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider block">
                  Medicamento Identificado:
                </span>
                <h4 className="text-sm font-bold text-white">
                  {productoDetectado.nombre_comercial}
                </h4>
                <p className="text-xs text-slate-300">
                  {productoDetectado.principio_activo} • {productoDetectado.presentacion}
                </p>
                <span className="text-[10px] font-mono text-slate-400">
                  EAN13: {productoDetectado.codigo_barras_ean13} | Lab: {productoDetectado.laboratorio}
                </span>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">Stock:</span>
                <span className="text-xs font-bold text-emerald-400">
                  {productoDetectado.stock_disponible} uds
                </span>
              </div>
            </div>

            {/* Configurar Unidades y Descuento */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-teal-500/20 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Cantidad (Uds)
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    step={productoDetectado.empaque_minimo || 1}
                    value={cantidad}
                    onChange={(e) => setCantidad(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono text-center font-bold"
                  />
                  <span className="text-[10px] text-slate-400">
                    x{productoDetectado.empaque_minimo}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Descuento (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={productoDetectado.descuento_maximo_porc}
                  step={0.5}
                  value={descuento}
                  onChange={(e) => setDescuento(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono text-center font-bold"
                />
              </div>
            </div>

            <button
              onClick={handleConfirmar}
              className="w-full py-2 rounded-xl font-bold text-xs bg-teal-500 hover:bg-teal-400 text-slate-950 transition-all flex items-center justify-center gap-2 shadow"
            >
              <Check className="w-4 h-4" />
              Confirmar y Agregar {cantidad} Unidades al Pedido
            </button>
          </div>
        ) : (
          /* Botones de simulación de códigos de prueba */
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-slate-400 block">
              Simulador de escaneo rápido (Medicamentos del Vademécum):
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {productos.slice(0, 4).map((p) => (
                <button
                  key={p.id}
                  onClick={() => procesarCodigo(p.codigo_barras_ean13)}
                  className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-left transition-colors"
                >
                  <span className="font-bold text-white block truncate">{p.nombre_comercial}</span>
                  <span className="text-[10px] font-mono text-teal-400 block">{p.codigo_barras_ean13}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {errorCamara && !productoDetectado && (
          <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorCamara}</span>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-800">
          <button
            onClick={onCerrar}
            className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
};
