import { Producto, ItemDictadoReconocido } from '../types/pharmacy';

const PALABRAS_NUMEROS: Record<string, number> = {
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veinticinco: 25,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
  doscientos: 200,
  quinientos: 500,
};

function normalizarTexto(texto?: string): string {
  if (!texto) return '';
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[,;.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parsea un comando o frase hablada en lenguaje natural a líneas estructuradas de pedido farmacéutico.
 */
export function parsearDictadoVoz(
  transcripcion: string,
  catalogoProductos: Producto[]
): ItemDictadoReconocido[] {
  if (!transcripcion || !transcripcion.trim()) return [];

  const normalizado = normalizarTexto(transcripcion);
  // Dividir por conjunciones "y", "mas", "ademas" o comas
  const fragmentos = normalizado.split(/\b(?:y|ademas|tambien|luego)\b/);

  const resultados: ItemDictadoReconocido[] = [];

  for (const frag of fragmentos) {
    const textoFrag = frag.trim();
    if (!textoFrag) continue;

    // 1. Extraer posible descuento si menciona "descuento", "%", "por ciento"
    let descuento = 0;
    const matchDescuento = textoFrag.match(/(?:con|al|un)?\s*(\d{1,2}|diez|quince|veinte|doce|cinco)\s*(?:%|por\s*ciento|de\s*descuento|de\s*dscto)/);
    if (matchDescuento) {
      const valDesc = matchDescuento[1];
      descuento = PALABRAS_NUMEROS[valDesc] || parseInt(valDesc, 10) || 0;
    }

    // 2. Extraer cantidad
    let cantidad = 0;
    // Buscar dígitos directos
    const matchNumero = textoFrag.match(/\b(\d{1,4})\b/);
    if (matchNumero) {
      cantidad = parseInt(matchNumero[1], 10);
    } else {
      // Buscar palabra de número
      for (const [palabra, num] of Object.entries(PALABRAS_NUMEROS)) {
        const regex = new RegExp(`\\b${palabra}\\b(?:\\s+(?:cajas|unidades|blisters|frascos|pzas|piezas))?`, 'i');
        if (regex.test(textoFrag)) {
          cantidad = num;
          break;
        }
      }
    }

    // 3. Buscar el producto más afín en el vademécum
    let mejorProducto: Producto | null = null;
    let mejorPuntaje = 0;

    for (const prod of catalogoProductos) {
      if (!prod.activo) continue;

      const nombreNorm = normalizarTexto(prod.nombre_comercial || prod.product || '');
      const principioNorm = normalizarTexto(prod.principio_activo || prod.molecula || '');
      const skuNorm = normalizarTexto(prod.sku || prod.codigo || '');

      // Palabras clave del producto
      const palabrasProd = [...nombreNorm.split(' '), ...principioNorm.split(' ')].filter((p) => p.length > 3);

      let puntaje = 0;

      // Coincidencia exacta de nombre o principio activo
      if (textoFrag.includes(nombreNorm)) {
        puntaje += 100;
      } else if (textoFrag.includes(principioNorm)) {
        puntaje += 90;
      } else if (skuNorm && textoFrag.includes(skuNorm)) {
        puntaje += 80;
      } else {
        // Coincidencia parcial por palabras
        for (const palabra of palabrasProd) {
          if (textoFrag.includes(palabra)) {
            puntaje += 30;
          }
        }
      }

      if (puntaje > mejorPuntaje) {
        mejorPuntaje = puntaje;
        mejorProducto = prod;
      }
    }

    if (mejorProducto && mejorPuntaje >= 30) {
      // Si no detectó cantidad, asumir el empaque mínimo del producto
      const cantFinal = cantidad > 0 ? cantidad : mejorProducto.empaque_minimo || 10;
      // Respetar descuento máximo del producto
      const descFinal = Math.min(mejorProducto.descuento_maximo_porc, Math.max(0, descuento));

      resultados.push({
        producto: mejorProducto,
        cantidad: cantFinal,
        descuento: descFinal,
        confianza: Math.min(100, mejorPuntaje),
        textoOriginal: textoFrag,
      });
    }
  }

  return resultados;
}
