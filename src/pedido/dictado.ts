// Interpreta un pedido dictado: "Farmacia La Paz, diez losartán de cincuenta, cinco atorvastatina" ->
// cliente + líneas (unidades + producto) con alternativas para que el vendedor confirme en una vista previa.
// Funciona sin conexión: compara contra el catálogo y las farmacias guardadas en el dispositivo.
import { normalizar } from '../offline/busqueda';

// ---------------------------------------------------------------------------- números dichos con palabras

const UNIDADES: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const DECENAS: Record<string, number> = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const CENTENAS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400,
  quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700, ochocientos: 800,
  ochocientas: 800, novecientos: 900, novecientas: 900,
};
const esPalabraNumero = (t: string) => t in UNIDADES || t in DECENAS || t in CENTENAS || t === 'mil' || t === 'docena' || t === 'docenas';

/** Reemplaza las cifras dichas con palabras por dígitos: "treinta y cinco cajas" -> "35 cajas". */
export function palabrasANumeros(tokens: string[]): string[] {
  const salida: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    // "media docena" / "una docena de"
    if (t === 'media' && tokens[i + 1] === 'docena') { salida.push('6'); i += 2; continue; }
    if (!esPalabraNumero(t) || ((t === 'un' || t === 'una') && !esPalabraNumero(tokens[i + 1] ?? '') && tokens[i + 1] !== 'docena')) {
      // "un"/"una" sueltos son artículo salvo que vayan seguidos de producto: se tratan como 1 más abajo.
      if ((t === 'un' || t === 'una') && tokens[i + 1] && !esPalabraNumero(tokens[i + 1])) { salida.push('1'); i++; continue; }
      salida.push(t);
      i++;
      continue;
    }
    // Gramática de las cifras: centenas -> decenas -> ("y") unidades. "cincuenta cinco" son DOS cifras (50 y 5): del 31 al
    // 99 las decenas solo se unen a las unidades con "y".
    let total = 0;
    let actual = 0;
    let ultimo: 'nada' | 'centena' | 'decena' | 'decena_y' | 'unidad' = 'nada';
    while (i < tokens.length) {
      const w = tokens[i];
      if (w in CENTENAS && ultimo === 'nada') { actual += CENTENAS[w]; ultimo = 'centena'; i++; continue; }
      if (w in DECENAS && (ultimo === 'nada' || ultimo === 'centena')) { actual += DECENAS[w]; ultimo = 'decena'; i++; continue; }
      if (w in UNIDADES && (ultimo === 'nada' || ultimo === 'centena' || ultimo === 'decena_y')) { actual += UNIDADES[w]; ultimo = 'unidad'; i++; continue; }
      if (w === 'y' && ultimo === 'decena' && tokens[i + 1] && tokens[i + 1] in UNIDADES && UNIDADES[tokens[i + 1]] < 10) { ultimo = 'decena_y'; i++; continue; }
      if (w === 'mil' && ultimo !== 'decena_y') { total += (actual || 1) * 1000; actual = 0; ultimo = 'nada'; i++; continue; }
      if ((w === 'docena' || w === 'docenas') && ultimo !== 'decena_y') { actual = (actual || 1) * 12; ultimo = 'unidad'; i++; continue; }
      break;
    }
    salida.push(String(total + actual));
  }
  return salida;
}

// ---------------------------------------------------------------------------- estructura de la frase

/** Palabras que siguen a una cantidad y no son parte del producto ("10 cajas de losartán"). */
const TRAS_CANTIDAD = new Set(['unidades', 'unidad', 'uds', 'ud', 'cajas', 'caja', 'blister', 'blisters', 'frascos', 'frasco', 'de', 'del']);
/** Tras un número indican concentración o presentación: el número es parte del producto ("losartán 50 mg"). */
const MEDIDAS = new Set(['mg', 'g', 'gr', 'ml', 'mcg', 'ug', 'ui', 'miligramos', 'gramos', 'mililitros', 'microgramos', 'por', 'x', 'porciento']);
/** Palabras de relleno entre líneas o al inicio. */
const RELLENO = new Set(['y', 'e', 'coma', 'luego', 'tambien', 'mas', 'ademas', 'pedido', 'pedir', 'anota', 'anotar', 'agrega', 'agregar', 'pon', 'ponle', 'quiero', 'necesito', 'otro', 'otra']);
const INICIO_CLIENTE = new Set(['para', 'cliente', 'a']);

export interface FraseDictada {
  /** Palabras que nombran a la farmacia (antes del primer producto). */
  cliente: string[];
  lineas: { palabras: string[]; unidades: number | null }[];
}

const esNumero = (t: string | undefined) => !!t && /^\d+$/.test(t);

/**
 * Separa la frase en farmacia y líneas. Admite la cantidad antes ("diez losartán") o después ("losartán diez"); un número
 * seguido de "mg", "ml", "x"... o de otro número es parte del nombre (concentración), no la cantidad.
 */
export function separarFrase(texto: string, esNombreDeCliente: (palabras: string[]) => number): FraseDictada {
  // La coma o el punto separan líneas ("cincuenta, cinco"): se conservan como la palabra "coma" (relleno).
  let tokens = palabrasANumeros(normalizar(texto.replace(/[,;.](\s|$)/g, ' coma ')).split(' ').filter(Boolean));
  // Relleno inicial ("pedido para ...").
  while (tokens.length && (RELLENO.has(tokens[0]) || INICIO_CLIENTE.has(tokens[0]))) tokens = tokens.slice(1);

  // La farmacia: el prefijo (antes de la primera cantidad) que mejor coincide con una farmacia conocida.
  const primeraCantidad = tokens.findIndex((t, i) => esNumero(t) && tokens[i + 1] !== undefined && !esNumero(tokens[i + 1]) && !MEDIDAS.has(tokens[i + 1]));
  // Si la farmacia se separa con una pausa o coma ("Farmacia 24 Horas, 3 losartán"), su nombre puede llevar números.
  let limite = primeraCantidad < 0 ? Math.min(tokens.length, 6) : primeraCantidad;
  const coma = tokens.indexOf('coma');
  if (coma > 0 && coma <= 8) limite = Math.max(limite, coma);
  const prefijo = tokens.slice(0, limite);
  let largo = 0;
  let mejor = 0;
  for (let n = Math.min(prefijo.length, 8); n >= 1; n--) {
    const p = esNombreDeCliente(prefijo.slice(0, n));
    if (p > mejor + 0.05) { mejor = p; largo = n; }
  }
  const cliente = mejor >= 0.4 ? prefijo.slice(0, largo) : [];
  const resto = tokens.slice(cliente.length);

  const lineas: FraseDictada['lineas'] = [];
  let actual: { palabras: string[]; unidades: number | null; cerrada: boolean } | null = null;
  const cerrar = () => { if (actual && (actual.palabras.length || actual.unidades !== null)) lineas.push({ palabras: actual.palabras, unidades: actual.unidades }); };
  for (let i = 0; i < resto.length; i++) {
    const t = resto[i];
    // Lo que sigue al número, saltando el relleno ("losartán 100 y 6 omeprazol": tras el 100 viene otro número).
    let k = i + 1;
    while (k < resto.length && RELLENO.has(resto[k])) k++;
    const sig = resto[k];
    if (esNumero(t)) {
      const n = Number(t);
      const anterior = resto[i - 1];
      const esMedida = (sig && MEDIDAS.has(sig)) || anterior === 'x' || anterior === 'por' || esNumero(sig);
      if (esMedida && actual && actual.palabras.length) { actual.palabras.push(t); continue; }
      if (!sig) {
        // Número al final: cantidad si la línea no tiene; si no, concentración.
        if (actual && actual.unidades === null) actual.unidades = n;
        else if (actual) actual.palabras.push(t);
        continue;
      }
      if (actual && actual.unidades === null && actual.palabras.length) {
        // "losartán diez ...": la cantidad va después del producto.
        actual.unidades = n;
        actual.cerrada = true;
      } else {
        cerrar();
        actual = { palabras: [], unidades: n, cerrada: false };
      }
      while (resto[i + 1] && TRAS_CANTIDAD.has(resto[i + 1])) i++;
      continue;
    }
    if (RELLENO.has(t)) continue;
    if (!actual || actual.cerrada) {
      cerrar();
      actual = { palabras: [t], unidades: null, cerrada: false };
    } else actual.palabras.push(t);
  }
  cerrar();
  return { cliente, lineas: lineas.filter((l) => l.palabras.length > 0) };
}

// ---------------------------------------------------------------------------- coincidencias

/** Distancia de edición acotada (para errores del reconocimiento de voz: "atorvastatina" / "atorbastatina"). */
function distancia(a: string, b: string, tope = 2): number {
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let minFila = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      minFila = Math.min(minFila, cur[j]);
    }
    if (minFila > tope) return tope + 1;
    prev = cur;
  }
  return prev[b.length];
}

const IGNORAR = new Set(['farmacia', 'farmacias', 'drogueria', 'la', 'el', 'los', 'las', 'de', 'del', 'ca', 'c', 'a', 's', 'sa', 'srl', 'y']);

/** Qué tan bien las palabras dichas describen un texto (0 a 1). Los números deben coincidir exactos. */
export function parecido(palabras: string[], objetivo: string[]): number {
  const utiles = palabras.filter((p) => !IGNORAR.has(p));
  if (utiles.length === 0) return 0;
  let suma = 0;
  for (const p of utiles) {
    let mejor = 0;
    for (const o of objetivo) {
      if (o === p) { mejor = 1; break; }
      if (/^\d+$/.test(p)) continue;
      if (p.length >= 4 && (o.startsWith(p) || p.startsWith(o)) && o.length >= 4) mejor = Math.max(mejor, 0.85);
      else if (p.length >= 5 && distancia(p, o) <= (p.length >= 9 ? 2 : 1)) mejor = Math.max(mejor, 0.75);
    }
    suma += mejor;
  }
  return suma / utiles.length;
}

// ---------------------------------------------------------------------------- droguería y plantilla

export interface DrogueriaDictable { id: string; nombre: string; codigo: string }

const ANTES_DROGUERIA = new Set(['drogueria', 'por', 'con', 'via', 'en', 'a', 'traves', 'despachar', 'despacho', 'enviar']);

/**
 * Saca de la frase la droguería ("… por Cobeca", "droguería Drocerca") y el pedido de guardarla como plantilla
 * ("… guárdalo como plantilla semanal"). Devuelve el resto de la frase para interpretar farmacia y productos.
 */
export function extraerDrogueriaYPlantilla<D extends DrogueriaDictable>(texto: string, droguerias: D[]): { resto: string; drogueria: D | null; plantilla: { nombre: string } | null } {
  let tokens = normalizar(texto.replace(/[,;.](\s|$)/g, ' coma ')).split(' ').filter(Boolean);

  // "guardar como plantilla <nombre>" / "es una plantilla" / "plantilla": desde ahí hasta el final.
  let plantilla: { nombre: string } | null = null;
  const iPlantilla = tokens.indexOf('plantilla');
  if (iPlantilla >= 0) {
    let desde = iPlantilla;
    while (desde > 0 && ['guardar', 'guarda', 'guardalo', 'guardala', 'guardarlo', 'como', 'en', 'una', 'la', 'es', 'y', 'coma', 'lo', 'de'].includes(tokens[desde - 1])) desde--;
    const nombre = tokens.slice(iPlantilla + 1).filter((t) => t !== 'coma').join(' ');
    plantilla = { nombre: nombre ? nombre.charAt(0).toUpperCase() + nombre.slice(1) : '' };
    tokens = tokens.slice(0, desde);
  }

  // La droguería: su nombre o código, dicho con "droguería", "por", "con"… delante, o un nombre exacto de 4+ letras.
  let drogueria: D | null = null;
  const nombres = droguerias.map((d) => ({ d, partes: normalizar(d.nombre).split(' ').filter((t) => t && t !== 'drogueria'), codigo: normalizar(d.codigo) }));
  for (let i = 0; i < tokens.length && !drogueria; i++) {
    for (const { d, partes, codigo } of nombres) {
      const n = partes.length;
      if (n === 0) continue;
      const trozo = tokens.slice(i, i + n);
      const coincide = trozo.length === n && trozo.every((t, k) => t === partes[k] || (t.length >= 5 && distancia(t, partes[k]) <= 1));
      const porCodigo = codigo.length >= 3 && tokens[i] === codigo;
      if (!coincide && !porCodigo) continue;
      const largo = coincide ? n : 1;
      const conMarca = i > 0 && ANTES_DROGUERIA.has(tokens[i - 1]);
      if (!conMarca && partes.join('').length < 4) continue;
      let desde = i;
      while (desde > 0 && ANTES_DROGUERIA.has(tokens[desde - 1])) desde--;
      drogueria = d;
      tokens = [...tokens.slice(0, desde), 'coma', ...tokens.slice(i + largo)];
      break;
    }
  }
  return { resto: tokens.join(' '), drogueria, plantilla };
}

// ---------------------------------------------------------------------------- resultado

export interface ProductoDictable { id: string; nombre_comercial: string; presentacion?: string | null; principio_activo?: string | null; sku: string; empaque_minimo: number; tokens: string[]; activo: boolean }
export interface ClienteDictable { id: string; nombre_comercial: string; razon_social: string; codigo_interno?: string | null; busqueda: string }

export interface LineaDictada<P> {
  texto: string;
  unidades: number;
  /** Mejor coincidencia (null si no se entendió). */
  producto: P | null;
  /** Otras opciones parecidas, de mejor a peor. */
  alternativas: P[];
  confianza: number;
}

export interface PedidoDictado<C, P, D = DrogueriaDictable> {
  cliente: C | null;
  alternativasCliente: C[];
  lineas: LineaDictada<P>[];
  /** Droguería dicha en la frase (null si no se dijo). */
  drogueria: D | null;
  /** Se pidió guardar el pedido como plantilla (con su nombre, si se dijo). */
  plantilla: { nombre: string } | null;
}

const UMBRAL = 0.5;

/** Interpreta el texto dictado contra las farmacias y el catálogo del dispositivo. */
export function interpretarDictado<C extends ClienteDictable, P extends ProductoDictable, D extends DrogueriaDictable = DrogueriaDictable>(
  textoDictado: string,
  clientes: C[],
  productos: P[],
  droguerias: D[] = []
): PedidoDictado<C, P, D> {
  const { resto: texto, drogueria, plantilla } = extraerDrogueriaYPlantilla(textoDictado, droguerias);
  const tokensCliente = new Map(clientes.map((c) => [c.id, c.busqueda.split(' ')]));
  const puntuarClientes = (palabras: string[]) =>
    clientes.map((c) => ({ c, p: parecido(palabras, tokensCliente.get(c.id) ?? []) })).filter((x) => x.p > 0).sort((a, b) => b.p - a.p);
  const frase = separarFrase(texto, (palabras) => puntuarClientes(palabras)[0]?.p ?? 0);

  const candidatosCliente = frase.cliente.length ? puntuarClientes(frase.cliente) : [];
  const activos = productos.filter((p) => p.activo);
  const lineas = frase.lineas.map((l) => {
    const puntuados = activos
      .map((p) => ({ p, s: parecido(l.palabras, p.tokens) + (normalizar(p.nombre_comercial).startsWith(l.palabras[0] ?? '~') ? 0.05 : 0) }))
      .filter((x) => x.s >= 0.3)
      .sort((a, b) => b.s - a.s || a.p.nombre_comercial.length - b.p.nombre_comercial.length)
      .slice(0, 6);
    const mejor = puntuados[0];
    const producto = mejor && mejor.s >= UMBRAL ? mejor.p : null;
    return {
      texto: l.palabras.join(' '),
      unidades: l.unidades ?? Math.max(1, producto?.empaque_minimo ?? 1),
      producto,
      alternativas: puntuados.filter((x) => x.p !== producto).map((x) => x.p),
      confianza: mejor ? Math.min(1, mejor.s) : 0,
    };
  });
  const clienteElegido = candidatosCliente[0] && candidatosCliente[0].p >= UMBRAL ? candidatosCliente[0].c : null;
  return {
    cliente: clienteElegido,
    alternativasCliente: candidatosCliente.filter((x) => x.c !== clienteElegido).slice(0, 5).map((x) => x.c),
    lineas,
    drogueria,
    plantilla,
  };
}
