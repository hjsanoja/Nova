import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import type { DependencyList } from 'react';

/**
 * Consulta reactiva sobre IndexedDB: se vuelve a ejecutar sola cuando cambian las tablas que lee
 * (por una escritura local o por la sincronización), sin polling.
 */
export function useLive<T>(consulta: () => Promise<T> | T, deps: DependencyList, inicial: T): T {
  const [valor, setValor] = useState<T>(inicial);
  useEffect(() => {
    const sub = liveQuery(async () => consulta()).subscribe({
      next: setValor,
      error: (e) => console.warn('liveQuery:', e),
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return valor;
}
