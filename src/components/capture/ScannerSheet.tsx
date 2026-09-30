import React, { useEffect, useRef, useState } from 'react';
import { ScanLine } from 'lucide-react';
import type { Html5Qrcode } from 'html5-qrcode';
import { Sheet } from './Sheet';

interface ScannerSheetProps {
  abierto: boolean;
  onCerrar: () => void;
  /** Se invoca por cada lectura nueva; la hoja sigue abierta para escanear varios empaques seguidos. */
  onCodigo: (codigo: string) => void;
}

interface BarcodeDetectorLike {
  detect(imagen: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type BarcodeDetectorCtor = new (opciones?: { formats: string[] }) => BarcodeDetectorLike;

const FORMATOS = ['ean_13', 'ean_8', 'upc_a', 'code_128', 'qr_code'];
const REPETICION_MS = 1500;
const REGION_ID = 'nova-scanner-region';

/**
 * Escáner de empaques (módulo C.1): usa la Barcode Detection API nativa cuando el navegador la ofrece
 * (Chrome/Android, rápida y sin descargar nada) y, si no, cae a html5-qrcode (ZXing) cargado bajo demanda.
 * Siempre queda la entrada manual para teclados con lector externo o cámaras sin permiso.
 */
export const ScannerSheet: React.FC<ScannerSheetProps> = ({ abierto, onCerrar, onCodigo }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [motor, setMotor] = useState<'nativo' | 'zxing' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const ultimo = useRef({ codigo: '', en: 0 });
  const alCodigo = useRef(onCodigo);
  alCodigo.current = onCodigo;

  useEffect(() => {
    if (!abierto) return;
    let activo = true;
    let flujo: MediaStream | null = null;
    let temporizador: ReturnType<typeof setInterval> | undefined;
    let zxing: Html5Qrcode | null = null;
    setError(null);

    const emitir = (codigo: string) => {
      const ahora = Date.now();
      if (codigo === ultimo.current.codigo && ahora - ultimo.current.en < REPETICION_MS) return;
      ultimo.current = { codigo, en: ahora };
      navigator.vibrate?.(60);
      alCodigo.current(codigo);
    };

    (async () => {
      try {
        const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
        if (Detector) {
          setMotor('nativo');
          const detector = new Detector({ formats: FORMATOS });
          flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
          if (!activo || !videoRef.current) return;
          videoRef.current.srcObject = flujo;
          await videoRef.current.play();
          temporizador = setInterval(async () => {
            const video = videoRef.current;
            if (!video || video.readyState < 2) return;
            const lecturas = await detector.detect(video).catch(() => []);
            if (lecturas[0]) emitir(lecturas[0].rawValue);
          }, 150);
        } else {
          setMotor('zxing');
          const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
          if (!activo) return;
          zxing = new Html5Qrcode(REGION_ID, {
            verbose: false,
            formatsToSupport: [Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8, Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.QR_CODE],
          });
          await zxing.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 260, height: 140 } }, emitir, () => undefined);
        }
      } catch {
        if (activo) setError('No se pudo abrir la cámara. Escribe el código o usa un lector externo.');
      }
    })();

    return () => {
      activo = false;
      clearInterval(temporizador);
      flujo?.getTracks().forEach((t) => t.stop()); // libera la cámara
      if (zxing) void (zxing.isScanning ? zxing.stop() : Promise.resolve()).catch(() => undefined).finally(() => zxing?.clear());
    };
  }, [abierto]);

  return (
    <Sheet abierto={abierto} titulo="Escanear empaque" onCerrar={onCerrar}>
      <div className="space-y-3">
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-950">
          {motor === 'nativo' && <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />}
          {motor === 'zxing' && <div id={REGION_ID} className="h-full w-full" />}
          {!error && (
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-marca-400/80 shadow-[0_0_12px_rgba(45,212,191,0.9)]" aria-hidden />
          )}
          {error && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-300">{error}</p>}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) {
              emitir(manual.trim());
              setManual('');
            }
          }}
          className="flex gap-2"
        >
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            inputMode="numeric"
            placeholder="Código de barras o SKU"
            aria-label="Código de barras o SKU"
            className="min-h-12 flex-1 rounded-xl border border-slate-300 bg-white px-3 font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-marca-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          <button type="submit" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-marca-700 px-4 font-bold text-white">
            <ScanLine className="h-4 w-4" /> Buscar
          </button>
        </form>
      </div>
    </Sheet>
  );

  function emitir(codigo: string) {
    navigator.vibrate?.(60);
    onCodigo(codigo);
  }
};
