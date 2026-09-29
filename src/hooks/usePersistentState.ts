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

/** Respaldo asíncrono en IndexedDB (sin límite de 5MB) */
function guardarEnIndexedDB(clave: string, valor: unknown) {
  if (typeof window === 'undefined' || !window.indexedDB) return;
  try {
    const req = window.indexedDB.open('nova_storage_v1', 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('kv')) {
        req.result.createObjectStore('kv');
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(valor, clave);
    };
  } catch {
    /* ignore */
  }
}

/** Lectura asíncrona de respaldo desde IndexedDB */
export function leerDeIndexedDB<T>(clave: string): Promise<T | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open('nova_storage_v1', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('kv')) {
          req.result.createObjectStore('kv');
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('kv', 'readonly');
        const getReq = tx.objectStore('kv').get(clave);
        getReq.onsuccess = () => resolve((getReq.result as T) ?? null);
        getReq.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function escribir(clave: string, valor: unknown) {
  // Siempre respaldar en IndexedDB primero (soporta cientos de MBs)
  guardarEnIndexedDB(clave, valor);

  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // Cuota de localStorage excedida (~5 MB) pero resguardado en IndexedDB
    window.dispatchEvent(
      new CustomEvent(EVENTO_ERROR_ALMACENAMIENTO, { detail: { clave, respaldadoEnIndexedDB: true } })
    );
  }
}

/**
 * useState persistido en localStorage con respaldo automático en IndexedDB.
 * - Escribe con debounce (una sola serialización tras la última edición, no una por tecla).
 * - No reescribe los datos semilla mientras nadie los modifique.
 * - Vacía escrituras pendientes al ocultar/cerrar la pestaña.
 * - Si localStorage excede su cuota (5MB), los datos quedan a salvo en IndexedDB.
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

  // Si localStorage estaba vacío o falló al cargar, intentar recuperar desde IndexedDB
  useEffect(() => {
    let montado = true;
    leerDeIndexedDB<T>(clave).then((desdeIdb) => {
      if (!montado || modificado.current || desdeIdb === null || desdeIdb === undefined) return;
      const saneado = leer ? leer(desdeIdb) : desdeIdb;
      if (saneado !== undefined && saneado !== null) {
        setValorInterno(saneado);
      }
    });
    return () => {
      montado = false;
    };
  }, [clave, leer]);

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
