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
