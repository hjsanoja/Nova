import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Sheet } from '../components/capture/Sheet';
import { Boton, Vacio, estiloInput, useDebounced } from '../components/ui/kit';
import { getSupabaseClient } from '../services/supabaseClient';
import { cambiarMiFichero, farmaciasDisponibles, refrescarFarmaciasDelDispositivo } from '../services/ficheroVendedor';
import type { FarmaciaDisponible } from '../services/ficheroVendedor';

/**
 * El vendedor busca farmacias que aún NO tiene en su fichero, marca las que atiende y las agrega.
 * Las que ya son suyas no aparecen, así no se duplican.
 */
export function AgregarFarmacias({ abierto, vendedorId, onCerrar, onAgregadas }: { abierto: boolean; vendedorId: string; onCerrar: () => void; onAgregadas: (n: number) => void }) {
  const [texto, setTexto] = useState('');
  const q = useDebounced(texto, 300);
  const [lista, setLista] = useState<FarmaciaDisponible[]>([]);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!abierto) return;
    const sb = getSupabaseClient();
    if (!sb) return setError('Sin conexión con la nube.');
    let vivo = true;
    setCargando(true);
    setError('');
    farmaciasDisponibles(sb, q)
      .then((r) => { if (vivo) setLista(r); })
      .catch((e: unknown) => { if (vivo) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [abierto, q]);

  const cerrar = () => {
    setTexto('');
    setMarcadas(new Set());
    setError('');
    onCerrar();
  };

  const alternar = (codigo: string) =>
    setMarcadas((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(codigo)) nuevo.delete(codigo);
      else nuevo.add(codigo);
      return nuevo;
    });

  const agregar = async () => {
    const sb = getSupabaseClient();
    if (!sb || marcadas.size === 0) return;
    setGuardando(true);
    setError('');
    try {
      const n = await cambiarMiFichero(sb, vendedorId, [...marcadas], 'agregar');
      await refrescarFarmaciasDelDispositivo();
      onAgregadas(n);
      cerrar();
    } catch (e: unknown) {
      setError(navigator.onLine === false ? 'Necesitas conexión a internet para agregar farmacias.' : e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Sheet abierto={abierto} titulo="Agregar farmacias a mi fichero" onCerrar={cerrar} ancho="md:max-w-xl">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre, RIF, código o municipio" aria-label="Buscar farmacia" className={`${estiloInput} pl-9`} autoFocus />
        </div>
        <p className="text-xs text-slate-500">Solo aparecen las farmacias que todavía no tienes. Marca las que atiendes y toca Agregar.</p>
        {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>}
        {cargando && lista.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Buscando…</p>
        ) : lista.length === 0 ? (
          <Vacio titulo={q ? 'Sin resultados' : 'No hay farmacias disponibles'} texto={q ? 'Prueba con otra búsqueda.' : 'Ya tienes todas las farmacias activas en tu fichero.'} />
        ) : (
          <ul className="max-h-[50dvh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {lista.map((f) => (
              <li key={f.codigo_interno}>
                <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <input type="checkbox" checked={marcadas.has(f.codigo_interno)} onChange={() => alternar(f.codigo_interno)} className="mt-1 h-4 w-4 accent-teal-600" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{f.nombre_comercial}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {[f.codigo_interno, f.rif, f.municipio ?? f.estado_geografico, f.bandera].filter(Boolean).join(' · ')}
                    </span>
                    {f.vendedores > 0 && <span className="block text-[11px] text-slate-400">La atiende{f.vendedores > 1 ? `n ${f.vendedores} vendedores` : ' 1 vendedor'} más</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {lista.length >= 50 && <p className="text-xs text-slate-500">Se muestran las primeras 50. Escribe para buscar otras.</p>}
        <div className="flex justify-end gap-2">
          <Boton onClick={cerrar}>Cancelar</Boton>
          <Boton variante="primario" icono={Plus} disabled={marcadas.size === 0 || guardando} onClick={() => void agregar()}>
            {guardando ? 'Agregando…' : `Agregar${marcadas.size ? ` ${marcadas.size}` : ''}`}
          </Boton>
        </div>
      </div>
    </Sheet>
  );
}
