const PALABRAS_STOP = new Set(['farmacia', 'farmacias', 'botica', 'drogueria', 'c.a', 'ca', 's.a', 'sa', 's.r.l', 'srl', 'de', 'la', 'el', 'los', 'las', 'y']);

/** Nombre ya normalizado y tokenizado: se prepara una vez y se compara muchas veces. */
export interface NombrePreparado {
  vacio: boolean;
  texto: string;
  tokens: string[];
}

export function prepararNombre(nombre: string): NombrePreparado {
  if (!nombre) return { vacio: true, texto: '', tokens: [] };
  const texto = nombre.toLowerCase().trim().replace(/[.,\-_/]/g, ' ');
  const tokens = texto.split(/\s+/).filter((t) => t.length > 1 && !PALABRAS_STOP.has(t));
  return { vacio: false, texto, tokens };
}

// Algoritmo de similitud de nombres de farmacias (Token Dice-Sørensen + Substring) sobre nombres preparados.
export function similitudPreparada(a: NombrePreparado, b: NombrePreparado): number {
  if (a.vacio || b.vacio) return 0;
  if (a.texto === b.texto) return 100;
  if (a.texto.includes(b.texto) || b.texto.includes(a.texto)) return 85;

  const tokensA = a.tokens;
  const tokensB = b.tokens;
  if (tokensA.length === 0 || tokensB.length === 0) {
    return a.texto.slice(0, 4) === b.texto.slice(0, 4) ? 60 : 0;
  }

  let coincidencias = 0;
  for (const tA of tokensA) {
    if (tokensB.some((tB) => tB === tA || (tA.length > 3 && tB.includes(tA)) || (tB.length > 3 && tA.includes(tB)))) {
      coincidencias++;
    }
  }

  const score = Math.round((2 * coincidencias / (tokensA.length + tokensB.length)) * 100);
  return Math.min(100, Math.max(0, score));
}

export function calcularSimilitudNombres(nombreA: string, nombreB: string): number {
  return similitudPreparada(prepararNombre(nombreA), prepararNombre(nombreB));
}

// Detección automática del mes desde el nombre del archivo (ej: ventas_enero, ventas_febrero)
export function detectarMesDeNombreArchivo(nombre: string): { mesNum: string; mesTexto: string; anio: string; periodo: string } | null {
  if (!nombre) return null;
  const nom = nombre.toLowerCase();
  const meses = [
    { regex: /enero|ene|january|jan/i, num: '01', texto: 'Enero' },
    { regex: /febrero|feb|february/i, num: '02', texto: 'Febrero' },
    { regex: /marzo|mar|march/i, num: '03', texto: 'Marzo' },
    { regex: /abril|abr|april/i, num: '04', texto: 'Abril' },
    { regex: /mayo|may/i, num: '05', texto: 'Mayo' },
    { regex: /junio|jun|june/i, num: '06', texto: 'Junio' },
    { regex: /julio|jul|july/i, num: '07', texto: 'Julio' },
    { regex: /agosto|ago|august|aug/i, num: '08', texto: 'Agosto' },
    { regex: /septiembre|setiembre|sep|sept|september/i, num: '09', texto: 'Septiembre' },
    { regex: /octubre|oct|october/i, num: '10', texto: 'Octubre' },
    { regex: /noviembre|nov|november/i, num: '11', texto: 'Noviembre' },
    { regex: /diciembre|dic|december/i, num: '12', texto: 'Diciembre' },
  ];
  const anioMatch = nom.match(/202[4-9]/);
  const anio = anioMatch ? anioMatch[0] : new Date().getFullYear().toString();

  for (const m of meses) {
    if (m.regex.test(nom)) {
      return {
        mesNum: m.num,
        mesTexto: m.texto,
        anio,
        periodo: `${anio}-${m.num}`
      };
    }
  }
  return null;
}

export type FilaCsv = Record<string, string>;

/**
 * Crea un lector de columnas tolerante a mayúsculas/espacios. El índice de encabezados se construye
 * una sola vez por archivo (antes se recorrían las llaves de cada fila para cada columna: O(filas x columnas x llaves)).
 */
export function crearLectorColumnas(muestra: FilaCsv | undefined) {
  const indice = new Map<string, string>();
  if (muestra) {
    Object.keys(muestra).forEach((h) => {
      const clave = h.trim().toLowerCase();
      if (!indice.has(clave)) indice.set(clave, h);
    });
  }
  return (fila: FilaCsv, objetivos: string[]): string => {
    for (const objetivo of objetivos) {
      if (fila[objetivo] !== undefined) return fila[objetivo];
      const encabezado = indice.get(objetivo.toLowerCase());
      if (encabezado !== undefined && fila[encabezado] !== undefined) return fila[encabezado];
    }
    return '';
  };
}

/** Clave normalizada para comparar textos sin distinguir mayúsculas. */
export const norm = (v: string | undefined | null): string => (v ?? '').toLowerCase();
