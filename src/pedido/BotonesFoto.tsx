import { Camera, ImageIcon } from 'lucide-react';
import { prepararLector } from './leerFoto';

const estilo =
  'inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-within:ring-2 focus-within:ring-marca-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800';

/**
 * Dos botones separados: "Tomar foto" abre la cámara directo y "Elegir imagen" busca una captura o foto ya guardada.
 * Al tocar cualquiera se empieza a preparar el lector mientras la persona elige la imagen.
 */
export function BotonesFoto({ onImagen, deshabilitado = false }: { onImagen: (archivo: File) => void; deshabilitado?: boolean }) {
  const alElegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) onImagen(f);
  };
  const clase = `${estilo} ${deshabilitado ? 'pointer-events-none opacity-60' : ''}`;
  return (
    <>
      <label className={clase} onClick={() => prepararLector()}>
        <Camera className="h-4 w-4" aria-hidden />
        Tomar foto
        <input type="file" accept="image/*" capture="environment" aria-label="Tomar foto del pedido" className="sr-only" disabled={deshabilitado} onChange={alElegir} />
      </label>
      <label className={clase} onClick={() => prepararLector()}>
        <ImageIcon className="h-4 w-4" aria-hidden />
        Elegir imagen
        <input type="file" accept="image/*" aria-label="Elegir imagen o captura del pedido" className="sr-only" disabled={deshabilitado} onChange={alElegir} />
      </label>
    </>
  );
}
