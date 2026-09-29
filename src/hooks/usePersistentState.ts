import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

export const EVENTO_ERROR_ALMACENAMIENTO = 'nova:storage-error';

const escrituras = new Map<string, () => void>();

function vaciarPendientes() {
  escrituras.forEach((escribir) => escribir());
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', vaciarPendientes);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') vaciarPendientes();
  });
}

function escribir(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // Cuota de localStorage excedida (~5 MB) o almacenamiento bloqueado: la app sigue en memoria.
    window.dispatchEvent(new CustomEvent(EVENTO_ERROR_ALMACENAMIENTO, { detail: { clave } }));
  }
}

/**
 * useState persistido en localStorage.
 * - Escribe con debounce (una sola serialización tras la última edición, no una por tecla).
 * - No reescribe los datos semilla mientras nadie los modifique.
 * - Vacía escrituras pendientes al ocultar/cerrar la pestaña.
 * - Nunca lanza si el almacenamiento está lleno: avisa con el evento `nova:storage-error`.
 *
 * `leer` recibe el JSON guardado y devuelve el estado saneado, o `undefined` para usar `semilla`.
 */
export function usePersistentState<T>(
  clave: string,
  semilla: () => T,
  leer?: (guardado: unknown) => T | undefined,
  retardoMs = 400
): [T, Dispatch<SetStateAction<T>>] {
  const [valor, setValorInterno] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(clave);
      if (raw) {
        const parseado: unknown = JSON.parse(raw);
        const saneado = leer ? leer(parseado) : (parseado as T);
        if (saneado !== undefined && saneado !== null) return saneado;
      }
    } catch { /* JSON corrupto: se usa la semilla */ }
    return semilla();
  });

  const modificado = useRef(false);

  const setValor: Dispatch<SetStateAction<T>> = useCallback((siguiente) => {
    modificado.current = true;
    setValorInterno(siguiente);
  }, []);

  useEffect(() => {
    if (!modificado.current) return;
    const ejecutar = () => {
      clearTimeout(temporizador);
      escrituras.delete(clave);
      escribir(clave, valor);
    };
    const temporizador = setTimeout(ejecutar, retardoMs);
    escrituras.set(clave, ejecutar);
    return () => clearTimeout(temporizador);
  }, [clave, valor, retardoMs]);

  return [valor, setValor];
}
