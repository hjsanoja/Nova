// Pedido desde una foto o captura de pantalla: el texto se lee en el mismo teléfono (tesseract.js, gratis y sin servicios
// externos), se interpreta línea por línea contra el catálogo y pasa a la vista previa del dictado para corregir.

import { interpretarDictado, type DrogueriaDictable, type ClienteDictable, type OpcionesDictado, type PedidoDictado, type ProductoDictable } from './dictado';

/** Unidad de la presentación justo antes del número: ese número no es la cantidad ("Caja x 30", "x 30 tabletas"). */
const ANTES_DE_PRESENTACION = /\b(?:caja|tabl\w*|caps\w*|comp\w*|amp\w*|sobres?|frascos?)\s*$/i;
/** Medidas tras las que un número suelto al final es la cantidad (columna de una tabla: "Losartán 50 mg   10"). */
const MEDIDA_FINAL = /\b(?:mg|ml|g|gr|mcg|ui|%|tab\w*|caps?\w*|comp\w*|amp\w*|jbe|susp|crema|gotas)\.?$/i;
const SUFIJO_CANTIDAD = String.raw`\s*(?:und|unid|unidades|uds?|cajas?|cjs|cj)?\.?`;

/**
 * Limpia una línea leída: viñetas, numeración, precios, rellenos de puntos o guiones y errores típicos del lector
 * ("50 M8" -> "50 mg"). Devuelve la línea con la cantidad al inicio cuando la tiene ("10 Losartán 50 mg").
 */
function limpiarLinea(original: string): string {
  // Columna de cantidad de una tabla: dos o más espacios antes del número final (antes de juntar los espacios).
  const sinPrecio = original
    .replace(/(?:\$|bs\.?|usd|ref\.?)\s*\d[\d.,]*/gi, ' ')
    .replace(/\d[\d.,]*\s*(?:\$|bs\.?|usd)(?=\s|$)/gi, ' ')
    .replace(/[|_~«»"“”*•·]+/g, ' ')
    .replace(/\s+[lI!]\s*$/, '')
    .trimEnd();
  const columna = sinPrecio.match(/^(.*\S)\s{2,}(\d{1,4})$/);
  let l = (columna ? `${columna[1]} x ${columna[2]}` : sinPrecio)
    // Rellenos entre el producto y la cantidad ("Losartán ....... 10 cajas", "-.....--").
    .replace(/\s*[-–—.·…]{2,}[-–—.·…\s]*(?=\d)/g, ' x ')
    // Errores del lector en la unidad.
    .replace(/(\d)\s*(?:m8|mq|rng|ma|mag|mgs|rag)\b/gi, '$1 mg')
    .replace(/\s+/g, ' ')
    .trim()
    // Viñetas y numeración de la lista ("1.", "2)", "-").
    .replace(/^[-–—>•*·]+\s*/, '')
    .replace(/^\d{1,2}[.)]\s+(?=\D)/, '');

  // Cantidad al final: "... x 10", "... x10", "... - 10", "...: 10", "... 10 cajas", "... 10" tras una medida.
  const conMarca = l.match(new RegExp(String.raw`^(.*?[a-záéíóúñ].*?)\s*(?:[x×*]\s*|[-:=]\s*)(\d{1,4})${SUFIJO_CANTIDAD}$`, 'i'));
  const conUnidad = l.match(/^(.*?[a-záéíóúñ].*?)\s+(\d{1,4})\s*(?:und|unid|unidades|uds?|cajas?|cjs|cj)\.?$/i);
  const trasMedida = l.match(/^(.*?[a-záéíóúñ].*?)\s+(\d{1,4})$/);
  const alFinal = conMarca ?? conUnidad ?? (trasMedida && MEDIDA_FINAL.test(trasMedida[1]) ? trasMedida : null);
  if (alFinal && !ANTES_DE_PRESENTACION.test(alFinal[1])) {
    // Numeración que perdió el punto ("5 Metformina ... 6 cajas"): con la cantidad al final, el número inicial sobra.
    const producto = alFinal[1].trim().replace(/^\d{1,2}\s+(?=[a-záéíóúñ])/i, '');
    l = `${alFinal[2]} ${producto}`;
  }
  return l;
}

/** Líneas útiles de lo leído (con al menos una palabra), con la cantidad al inicio cuando la tienen. */
export function lineasDeFoto(texto: string): string[] {
  return texto
    .replace(/\r/g, '')
    .split('\n')
    .map(limpiarLinea)
    .filter((l) => /[a-záéíóúñ]{3,}/i.test(l));
}

/** Texto para revisar y corregir: una línea por producto ("10 Losartán 50 mg"). */
export function textoDeFotoAPedido(texto: string): string {
  return lineasDeFoto(texto).join('\n');
}

/**
 * Interpreta lo leído de una foto línea por línea: en una lista escrita cada línea es un producto con su cantidad, así que
 * la cantidad nunca pasa al producto vecino. Las líneas sin producto (saludo, "Pedido Farmacia La Paz por Cobeca") dan la
 * farmacia y la droguería.
 */
export function interpretarFoto<C extends ClienteDictable, P extends ProductoDictable, D extends DrogueriaDictable = DrogueriaDictable>(
  texto: string,
  clientes: C[],
  productos: P[],
  droguerias: D[] = [],
  opciones: OpcionesDictado<C> = {}
): PedidoDictado<C, P, D> {
  const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
  const encabezado: string[] = [];
  const deProductos: { texto: string; unidades: number | null }[] = [];
  for (const l of lineas) {
    const m = l.match(/^(\d{1,4})\s+(.*[a-záéíóúñ].*)$/i);
    if (m) { deProductos.push({ texto: m[2], unidades: Number(m[1]) }); continue; }
    // Sin cantidad: es encabezado si nombra la farmacia o la droguería; si no, un producto con 1 unidad cuando se parece mucho.
    const cab = interpretarDictado(l, clientes, [], droguerias);
    if (cab.cliente || cab.drogueria) { encabezado.push(l); continue; }
    const solo = interpretarDictado(l, [], productos);
    if (solo.lineas.length === 1 && solo.lineas[0].producto && solo.lineas[0].confianza >= 0.8) deProductos.push({ texto: l, unidades: null });
    else encabezado.push(l);
  }
  const cab = interpretarDictado(encabezado.join(', '), clientes, [], droguerias, opciones);
  const deQuien = cab.cliente ?? opciones.clientePorDefecto ?? null;
  return {
    ...cab,
    lineas: deProductos.flatMap((p) => {
      const r = interpretarDictado(p.texto, [], productos, [], { clientePorDefecto: deQuien, historial: opciones.historial });
      // Toda la línea es un solo producto (si el intérprete la partió, se toma la mejor parte).
      const mejor = [...r.lineas].sort((a, b) => b.confianza - a.confianza)[0];
      return mejor ? [{ ...mejor, texto: p.texto, unidades: p.unidades ?? 1 }] : [];
    }),
  };
}

/**
 * Ajusta la imagen para leerla mejor: escala de grises y tamaño de trabajo (las capturas pequeñas se agrandan hasta 3
 * veces; las fotos grandes se reducen para leer más rápido). Probado con capturas, hojas impresas, tablas y notas.
 */
async function prepararImagen(archivo: Blob): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(archivo);
  } catch {
    throw new Error('No se pudo abrir la imagen. Si viene de Google Fotos, descárgala primero o elígela desde Archivos.');
  }
  const lado = Math.max(bitmap.width, bitmap.height);
  const escala = Math.min(3, 2400 / lado);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo preparar la imagen.');
  ctx.filter = 'grayscale(1)';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas;
}

// El lector (tesseract) y el español se sirven desde la misma NOVA (carpeta ocr/), no desde internet: la primera vez se
// descargan unos 6 MB y quedan guardados en el teléfono; después funciona sin conexión.
type Lector = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;
let lector: Promise<Lector> | null = null;
let alAvanzarActual: ((avance: number, etapa: string) => void) | undefined;
let cierre: ReturnType<typeof setTimeout> | undefined;

function obtenerLector(): Promise<Lector> {
  if (!lector) {
    const base = new URL('ocr/', document.baseURI).href;
    lector = import('tesseract.js')
      .then(async ({ createWorker, PSM }) => {
        const w = await createWorker('spa', 1, {
          workerPath: `${base}worker.min.js`,
          corePath: base,
          langPath: base.replace(/\/$/, ''),
          logger: (m: { status: string; progress: number }) => {
            const leyendo = m.status.includes('recogniz');
            alAvanzarActual?.(leyendo ? 0.3 + m.progress * 0.7 : m.progress * 0.3, leyendo ? 'Leyendo la imagen' : 'Preparando el lector');
          },
        });
        // Modo "bloque de texto": lee la lista completa en orden, línea por línea (el más preciso en las pruebas).
        await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1' });
        return w;
      })
      .catch((e) => {
        lector = null;
        throw e;
      });
  }
  return lector;
}

/** Empieza a cargar el lector mientras se elige la imagen (al tocar "Tomar foto" o "Elegir imagen"). */
export function prepararLector(): void {
  void obtenerLector().catch(() => undefined);
}

/** Lee el texto de una foto o captura. `alAvanzar` recibe de 0 a 1 mientras trabaja. */
export async function leerTextoDeImagen(archivo: Blob, alAvanzar?: (avance: number, etapa: string) => void): Promise<string> {
  if (archivo.type && !archivo.type.startsWith('image/')) throw new Error('Elige una imagen (foto o captura de pantalla).');
  clearTimeout(cierre);
  alAvanzarActual = alAvanzar;
  alAvanzar?.(0, 'Preparando el lector');
  const [imagen, w] = await Promise.all([prepararImagen(archivo), obtenerLector()]);
  try {
    const { data } = await w.recognize(imagen);
    return data.text ?? '';
  } finally {
    alAvanzarActual = undefined;
    // Queda listo para la siguiente foto; se libera la memoria tras 3 minutos sin uso.
    cierre = setTimeout(() => {
      const actual = lector;
      lector = null;
      void actual?.then((x) => x.terminate()).catch(() => undefined);
    }, 180_000);
  }
}
