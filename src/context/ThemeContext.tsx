import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

type Tema = 'claro' | 'oscuro';
/** Color principal de la app: azul (desde la v7.0) o el verde azulado de las primeras versiones. */
export type Paleta = 'azul' | 'clasica';

interface ThemeContextType {
  tema: Tema;
  toggleTema: () => void;
  esClaro: boolean;
  paleta: Paleta;
  setPaleta: (p: Paleta) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  tema: 'claro',
  toggleTema: () => {},
  esClaro: true,
  paleta: 'azul',
  setPaleta: () => {},
});

const CLASES_BODY = 'min-h-dvh font-sans antialiased transition-colors duration-200';
const CLAVE_TEMA = 'PHARMA_THEME';
const CLAVE_PALETA = 'NOVA_PALETA';

const leer = (clave: string) => {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
};

/** Aplica tema y paleta guardados antes del primer dibujo (main.tsx), para que la app no parpadee con otros colores. */
export function aplicarAparienciaGuardada(): void {
  const raiz = document.documentElement;
  raiz.classList.toggle('dark', leer(CLAVE_TEMA) === 'oscuro');
  if (leer(CLAVE_PALETA) === 'clasica') raiz.dataset.paleta = 'clasica';
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tema, setTema] = useState<Tema>(() => (leer(CLAVE_TEMA) === 'oscuro' ? 'oscuro' : 'claro'));
  const [paleta, setPaletaEstado] = useState<Paleta>(() => (leer(CLAVE_PALETA) === 'clasica' ? 'clasica' : 'azul'));

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_TEMA, tema);
      localStorage.setItem(CLAVE_PALETA, paleta);
    } catch { /* almacenamiento no disponible */ }
    const oscuro = tema === 'oscuro';
    const root = document.documentElement;
    root.classList.toggle('dark', oscuro);
    if (paleta === 'clasica') root.dataset.paleta = 'clasica';
    else delete root.dataset.paleta;
    root.style.colorScheme = oscuro ? 'dark' : 'light';
    document.body.className = `${CLASES_BODY} ${
      oscuro
        ? 'bg-slate-950 text-slate-100 selection:bg-marca-500'
        : 'bg-slate-50 text-slate-800 selection:bg-marca-700'
    } selection:text-white`;
    // Barra del navegador / de la app instalada con el color de la marca (o el fondo en modo oscuro).
    const marca = getComputedStyle(root).getPropertyValue('--color-marca-700').trim() || '#1e53bc';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', oscuro ? '#070c18' : marca);
  }, [tema, paleta]);

  const toggleTema = useCallback(() => {
    setTema((prev) => (prev === 'claro' ? 'oscuro' : 'claro'));
  }, []);
  const setPaleta = useCallback((p: Paleta) => setPaletaEstado(p), []);

  const value = useMemo(
    () => ({ tema, toggleTema, esClaro: tema === 'claro', paleta, setPaleta }),
    [tema, toggleTema, paleta, setPaleta]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
