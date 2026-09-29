import { useEffect, useState } from 'react';

/** Suscribe el componente a una media query CSS (p. ej. '(min-width: 768px)'). */
export function useMediaQuery(consulta: string): boolean {
  const [coincide, setCoincide] = useState(() => window.matchMedia(consulta).matches);

  useEffect(() => {
    const lista = window.matchMedia(consulta);
    const alCambiar = () => setCoincide(lista.matches);
    alCambiar();
    lista.addEventListener('change', alCambiar);
    return () => lista.removeEventListener('change', alCambiar);
  }, [consulta]);

  return coincide;
}
