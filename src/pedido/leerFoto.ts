// Pedido desde una foto o captura de pantalla: el texto se lee en el navegador (OCR con tesseract.js) y pasa por el mismo
// intérprete del dictado, con su vista previa para corregir. La primera vez descarga el lector de español (necesita
// internet); después queda guardado en el teléfono.

/**
 * Prepara lo leído para el intérprete: una línea = un producto. Quita precios, viñetas y ruido del OCR, y pasa la
 * cantidad al inicio cuando viene al final ("Losartán 50 mg x 10" -> "10 Losartán 50 mg").
 */
export function textoDeFotoAPedido(texto: string): string {
  const lineas = texto
    .replace(/\r/g, '')
    .split('\n')
    .map((l) =>
      l
        // Viñetas, numeración de la lista y separadores típicos del OCR.
        .replace(/^[\s\-–—•*·>|]+/, '')
        .replace(/^\d{1,2}[.)]\s+(?=\D)/, '')
        .replace(/[|_~«»"“”]/g, ' ')
        // Precios y montos ("$12,50", "Bs. 300", "12.50 USD").
        .replace(/(?:\$|bs\.?|usd|ref\.?)\s*\d[\d.,]*/gi, ' ')
        .replace(/\d[\d.,]*\s*(?:\$|bs\.?|usd)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((l) => /[a-záéíóúñ]{3,}/i.test(l));

  return lineas
    .map((l) => {
      // Cantidad al final: "... x 10", "... x10", "... - 10", "...: 10", "... 10 und/unid/cajas/cjs".
      const alFinal = l.match(/^(.*?[a-záéíóúñ].*?)\s*(?:[x×*]\s*|[-:=]\s*)(\d{1,4})\s*(?:und|unid|unidades|cajas?|cjs|uds)?\.?$/i)
        ?? l.match(/^(.*?[a-záéíóúñ].*?)\s+(\d{1,4})\s*(?:und|unid|unidades|cajas?|cjs|uds)\.?$/i);
      // No confundir con la presentación ("Caja x 30", "x 30 tabletas" va con más texto detrás).
      if (alFinal && !/\b(?:caja|tabl\w*|caps\w*|comp\w*|amp\w*)\s*$/i.test(alFinal[1])) return `${alFinal[2]} ${alFinal[1].trim()}`;
      return l;
    })
    .join(', ');
}

/** Ajusta la imagen para leerla mejor: tamaño de trabajo (las capturas pequeñas se agrandan) y escala de grises. */
async function prepararImagen(archivo: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(archivo);
  const lado = Math.max(bitmap.width, bitmap.height);
  const escala = lado > 2400 ? 2400 / lado : lado < 1200 ? 1200 / lado : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo preparar la imagen.');
  ctx.filter = 'grayscale(1) contrast(1.25)';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas;
}

/** Lee el texto de una foto o captura. `alAvanzar` recibe de 0 a 1 mientras trabaja. */
export async function leerTextoDeImagen(archivo: Blob, alAvanzar?: (avance: number, etapa: string) => void): Promise<string> {
  if (!archivo.type.startsWith('image/')) throw new Error('Elige una imagen (foto o captura de pantalla).');
  const imagen = await prepararImagen(archivo);
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('spa', 1, {
    logger: (m: { status: string; progress: number }) => {
      const etapa = m.status.includes('recogniz') ? 'Leyendo la imagen' : 'Preparando el lector';
      alAvanzar?.(m.status.includes('recogniz') ? 0.3 + m.progress * 0.7 : m.progress * 0.3, etapa);
    },
  });
  try {
    const { data } = await worker.recognize(imagen);
    return data.text ?? '';
  } finally {
    await worker.terminate();
  }
}
