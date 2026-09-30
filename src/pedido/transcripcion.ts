// Une lo que devuelve el reconocimiento de voz. En Android (Chrome) cada resultado suele repetir lo ya dicho
// ("pedido", "pedido para", "pedido para farmacia la paz"…); unir sin más daba "pedido pedido pedido farmacia farmacia".

const palabras = (t: string) => t.trim().split(/\s+/).filter(Boolean);
const clave = (w: string) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.,;:¡!¿?]/g, '');

/** Agrega un trozo al texto: si repite lo anterior (acumulado o solapado) solo suma lo nuevo. */
export function agregarTrozo(acumulado: string, trozo: string): string {
  const a = palabras(acumulado);
  const b = palabras(trozo);
  if (b.length === 0) return a.join(' ');
  if (a.length === 0) return b.join(' ');
  const ka = a.map(clave);
  const kb = b.map(clave);
  // El trozo ya contiene todo lo anterior (resultado acumulado): se reemplaza.
  if (kb.length >= ka.length && ka.every((w, i) => w === kb[i])) return b.join(' ');
  // El trozo ya está al final de lo acumulado (resultado repetido): no se suma.
  if (kb.length <= ka.length && kb.every((w, i) => w === ka[ka.length - kb.length + i])) return a.join(' ');
  // Solape: el final de lo acumulado es el comienzo del trozo.
  for (let k = Math.min(ka.length, kb.length - 1); k > 0; k--) {
    if (ka.slice(ka.length - k).every((w, i) => w === kb[i])) return [...a, ...b.slice(k)].join(' ');
  }
  return [...a, ...b].join(' ');
}

/** Une una lista de resultados finales en una sola frase sin repeticiones. */
export const unirTrozos = (trozos: string[], base = ''): string => trozos.reduce(agregarTrozo, base);

/** Quita palabras repetidas seguidas que el reconocimiento duplica ("pedido pedido para para"). */
export function sinRepeticiones(texto: string): string {
  const salida: string[] = [];
  for (const w of palabras(texto)) {
    const prev = salida[salida.length - 1];
    // Los números pueden repetirse de verdad ("dos dos" es raro, pero "10 10" puede ser 10 y 10): solo se colapsan palabras.
    if (prev && clave(prev) === clave(w) && !/\d/.test(w)) continue;
    salida.push(w);
  }
  return salida.join(' ');
}
