import React, { createContext, useContext, useState, useEffect } from 'react';

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

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tema, setTema] = useState<Tema>(() => {
    const guardado = localStorage.getItem('PHARMA_THEME');
    return (guardado as Tema) || 'claro'; // Modo claro por defecto como solicitó el usuario
  });

  useEffect(() => {
    localStorage.setItem('PHARMA_THEME', tema);
    if (tema === 'oscuro') {
      document.documentElement.classList.add('dark');
      document.body.className = 'bg-slate-950 text-slate-100 font-sans antialiased min-h-screen selection:bg-teal-500 selection:text-white transition-colors duration-200';
    } else {
      document.documentElement.classList.remove('dark');
      document.body.className = 'bg-slate-50 text-slate-800 font-sans antialiased min-h-screen selection:bg-teal-600 selection:text-white transition-colors duration-200';
    }
  }, [tema]);

  const toggleTema = () => {
    setTema((prev) => (prev === 'claro' ? 'oscuro' : 'claro'));
  };

  return (
    <ThemeContext.Provider value={{ tema, toggleTema, esClaro: tema === 'claro' }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
