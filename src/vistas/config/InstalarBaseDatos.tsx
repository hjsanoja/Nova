import { useState } from 'react';
import { Copy, Download } from 'lucide-react';
import { Boton, Tarjeta, useAviso } from '../../components/ui/kit';

type Script = 'instalar' | 'reiniciar';
const ARCHIVO: Record<Script, string> = { instalar: 'nova_produccion_v3.sql', reiniciar: '00_reiniciar_esquema_anterior.sql' };

/** Scripts de instalación del esquema en Supabase. Se descargan solo al pedirlos (el principal pesa ~150 KB). */
export function InstalarBaseDatos() {
  const [cargando, setCargando] = useState(false);
  const { mostrar, nodo } = useAviso();

  const obtener = async (script: Script) => {
    setCargando(true);
    try {
      return script === 'instalar'
        ? (await import('../../sql/nova_produccion_v3.sql?raw')).default
        : (await import('../../sql/00_reiniciar_esquema_anterior.sql?raw')).default;
    } finally {
      setCargando(false);
    }
  };
  const copiar = async (script: Script) => {
    await navigator.clipboard.writeText(await obtener(script));
    mostrar({ tipo: 'ok', texto: 'Script copiado. Pégalo en Supabase → SQL Editor y toca Run.' });
  };
  const descargar = async (script: Script) => {
    const url = URL.createObjectURL(new Blob([await obtener(script)], { type: 'text/sql;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: ARCHIVO[script] });
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
        <li>Debe terminar con "Success".</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <Boton variante="primario" icono={Copy} disabled={cargando} onClick={() => void copiar('instalar')}>Copiar script</Boton>
        <Boton icono={Download} disabled={cargando} onClick={() => void descargar('instalar')}>Descargar .sql</Boton>
      </div>
      <p className="mb-1 mt-4 text-sm font-bold">Si avisa de "una versión anterior de NOVA"</p>
      <p className="mb-3 text-xs text-slate-500">El proyecto tiene tablas o triggers de una versión vieja. Ejecuta primero este script: aparta todo lo anterior en un esquema de respaldo (no borra datos ni usuarios) y quita los triggers viejos. Luego vuelve a ejecutar el script principal.</p>
      <div className="flex flex-wrap gap-2">
        <Boton icono={Copy} disabled={cargando} onClick={() => void copiar('reiniciar')}>Copiar script de reinicio</Boton>
        <Boton icono={Download} disabled={cargando} onClick={() => void descargar('reiniciar')}>Descargar .sql</Boton>
      </div>
    </Tarjeta>
  );
}
