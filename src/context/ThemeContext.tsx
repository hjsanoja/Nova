import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

type Tema = 'claro' | 'oscuro';

interface ThemeContextType {
  tema: Tema;
  toggleTema: () => void;
  esClaro: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  tema: 'claro',
  toggleTema: () => {},
  esClaro: true,
});

const CLASES_BODY = 'min-h-dvh font-sans antialiased transition-colors duration-200';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tema, setTema] = useState<Tema>(() => {
    try {
      return localStorage.getItem('PHARMA_THEME') === 'oscuro' ? 'oscuro' : 'claro';
    } catch {
      return 'claro';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('PHARMA_THEME', tema);
    } catch { /* almacenamiento no disponible */ }
    const oscuro = tema === 'oscuro';
    const root = document.documentElement;
    root.classList.toggle('dark', oscuro);
    root.style.colorScheme = oscuro ? 'dark' : 'light';
    document.body.className = `${CLASES_BODY} ${
      oscuro
        ? 'bg-slate-950 text-slate-100 selection:bg-teal-500'
        : 'bg-slate-50 text-slate-800 selection:bg-teal-600'
    } selection:text-white`;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', oscuro ? '#020617' : '#0d9488');
  }, [tema]);

  const toggleTema = useCallback(() => {
    setTema((prev) => (prev === 'claro' ? 'oscuro' : 'claro'));
  }, []);

  const value = useMemo(
    () => ({ tema, toggleTema, esClaro: tema === 'claro' }),
    [tema, toggleTema]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
