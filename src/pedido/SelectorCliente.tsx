import { useMemo, useState } from 'react';
import { LocateFixed, Plus, Search, ShoppingCart } from 'lucide-react';
import { Sheet } from '../components/capture/Sheet';
import { Avatar, Boton, Campo, Etiqueta, Vacio, estiloInput, useDebounced } from '../components/ui/kit';
import { normalizar } from '../offline/busqueda';
import { obtenerDb } from '../offline/db';
import { solicitarSync } from '../offline/motor';
import { crearProspectoLocal } from '../offline/pedidos';
import type { LocalCliente } from '../offline/types';

const MAX = 60;

/** Elegir la farmacia del carrito. Las que ya tienen carrito aparecen primero. */
export function SelectorCliente({ abierto, clientes, conCarrito, onElegir, onCerrar, permitirNueva = true }: { abierto: boolean; clientes: LocalCliente[]; conCarrito: Set<string>; onElegir: (c: LocalCliente) => void; onCerrar: () => void; permitirNueva?: boolean }) {
  const [texto, setTexto] = useState('');
  const [nueva, setNueva] = useState(false);
  const q = useDebounced(texto, 150);
  const lista = useMemo(() => {
    const palabras = normalizar(q).split(' ').filter(Boolean);
    return clientes
      .filter((c) => c.estado_validacion !== 'inactivo' && palabras.every((p) => c.busqueda.includes(p)))
      .sort((a, b) => Number(conCarrito.has(b.id)) - Number(conCarrito.has(a.id)) || a.nombre_comercial.localeCompare(b.nombre_comercial));
  }, [clientes, q, conCarrito]);

  if (nueva) {
    return (
      <Sheet abierto={abierto} titulo="Nueva farmacia" onCerrar={() => { setNueva(false); onCerrar(); }}>
        <NuevoProspecto onCancelar={() => setNueva(false)} onCreada={(c) => { setNueva(false); onElegir(c); }} />
      </Sheet>
    );
  }

  return (
    <Sheet abierto={abierto} titulo="¿Para qué farmacia?" onCerrar={onCerrar}>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre, código o RIF" aria-label="Buscar farmacia" className={`${estiloInput} pl-9`} />
      </div>
      {lista.length === 0 ? (
        <Vacio titulo={clientes.length === 0 ? 'Aún no tienes farmacias' : 'Sin resultados'} texto={clientes.length === 0 ? 'Agrégalas en Mis clientes → Agregar farmacias.' : 'Prueba con otra búsqueda.'} />
      ) : (
        <ul className="-mx-2 divide-y divide-slate-100 dark:divide-slate-800">
          {lista.slice(0, MAX).map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => { onElegir(c); setTexto(''); }} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60">
                <Avatar nombre={c.nombre_comercial} tamano={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{c.nombre_comercial}</span>
                  <span className="block truncate text-xs text-slate-500">{[c.codigo_interno, c.municipio ?? c.brick].filter(Boolean).join(' · ')}</span>
                </span>
                {conCarrito.has(c.id) && <Etiqueta tono="marca"><ShoppingCart className="h-3 w-3" aria-hidden /> Carrito</Etiqueta>}
                {c.estado_validacion === 'prospecto_pendiente' && <Etiqueta tono="aviso">Por validar</Etiqueta>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {lista.length > MAX && <p className="mt-2 text-center text-xs text-slate-500">Se muestran {MAX} de {lista.length}. Escribe para encontrar otras.</p>}
      {permitirNueva && <Boton icono={Plus} variante="fantasma" className="mt-3 w-full" onClick={() => setNueva(true)}>Nueva farmacia (prospecto)</Boton>}
    </Sheet>
  );
}

/** Alta de una farmacia en campo: queda como prospecto hasta que la mesa valide el RIF y la homologación. */
function NuevoProspecto({ onCancelar, onCreada }: { onCancelar: () => void; onCreada: (c: LocalCliente) => void }) {
  const [form, setForm] = useState({ razon_social: '', rif: '', direccion: '', telefono: '' });
  const [gps, setGps] = useState<{ lat: number; lon: number } | null>(null);
  const [error, setError] = useState('');
  const ubicar = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => setGps({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => setError('No se pudo obtener la ubicación. Podrás completarla después.'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const c = await crearProspectoLocal(obtenerDb(), { ...form, lat: gps?.lat, lon: gps?.lon });
      solicitarSync();
      onCreada(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la farmacia');
    }
  };
  return (
    <form onSubmit={crear} className="flex flex-col gap-3">
      <Campo rotulo="Razón social"><input required value={form.razon_social} onChange={(e) => setForm({ ...form, razon_social: e.target.value })} className={estiloInput} /></Campo>
      <Campo rotulo="RIF"><input value={form.rif} onChange={(e) => setForm({ ...form, rif: e.target.value })} placeholder="J-12345678-9" className={estiloInput} /></Campo>
      <Campo rotulo="Dirección"><input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} className={estiloInput} /></Campo>
      <Campo rotulo="Teléfono"><input inputMode="tel" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className={estiloInput} /></Campo>
      <Boton icono={LocateFixed} onClick={ubicar}>{gps ? `Ubicación guardada (${gps.lat.toFixed(4)}, ${gps.lon.toFixed(4)})` : 'Usar mi ubicación actual'}</Boton>
      <p className="text-xs text-slate-500">Queda como <b>prospecto</b>: puedes tomarle pedidos, pero la mesa los revisa hasta validar el RIF y la cuenta en la droguería.</p>
      {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      <div className="flex justify-end gap-2">
        <Boton onClick={onCancelar}>Cancelar</Boton>
        <Boton type="submit" variante="primario">Guardar</Boton>
      </div>
    </form>
  );
}
