import { useState } from 'react';
import { Copy, Download } from 'lucide-react';
import { Boton, Tarjeta, useAviso } from '../../components/ui/kit';

/** Script de instalación del esquema en Supabase. Se descarga solo al pedirlo (pesa ~150 KB). */
export function InstalarBaseDatos() {
  const [cargando, setCargando] = useState(false);
  const { mostrar, nodo } = useAviso();

  const obtener = async () => {
    setCargando(true);
    try {
      return (await import('../../sql/nova_produccion_v3.sql?raw')).default;
    } finally {
      setCargando(false);
    }
  };
  const copiar = async () => {
    await navigator.clipboard.writeText(await obtener());
    mostrar({ tipo: 'ok', texto: 'Script copiado. Pégalo en Supabase → SQL Editor y toca Run.' });
  };
  const descargar = async () => {
    const url = URL.createObjectURL(new Blob([await obtener()], { type: 'text/sql;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'nova_produccion_v3.sql' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Tarjeta>
      {nodo}
      <p className="mb-1 text-sm font-bold">Instalar o actualizar la base de datos</p>
      <p className="mb-3 text-xs text-slate-500">Solo hace falta una vez por proyecto de Supabase (y cuando NOVA publique cambios). Se puede ejecutar varias veces sin riesgo: no borra datos.</p>
      <ol className="mb-3 list-decimal space-y-1 pl-5 text-xs text-slate-600 dark:text-slate-400">
        <li>Copia el script.</li>
        <li>En Supabase abre <b>SQL Editor</b> → <b>New query</b>, pega y toca <b>Run</b>.</li>
        <li>Debe terminar con "Success". Si avisa de tablas de una versión anterior, no continúes: avisa a soporte.</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <Boton variante="primario" icono={Copy} disabled={cargando} onClick={() => void copiar()}>Copiar script</Boton>
        <Boton icono={Download} disabled={cargando} onClick={() => void descargar()}>Descargar .sql</Boton>
      </div>
    </Tarjeta>
  );
}
