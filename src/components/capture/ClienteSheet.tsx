import React, { useState } from 'react';
import { LocateFixed, Plus, Search } from 'lucide-react';
import { obtenerDb } from '../../offline/db';
import { buscarClientes } from '../../offline/busqueda';
import { crearProspectoLocal } from '../../offline/pedidos';
import { solicitarSync } from '../../offline/motor';
import { useLive } from '../../offline/useLive';
import type { LocalCliente } from '../../offline/types';
import { Sheet } from './Sheet';

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  onElegir: (cliente: LocalCliente) => void;
}

const campo =
  'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white';

/** Selector de farmacia + alta de prospecto en campo (regla 4). */
export const ClienteSheet: React.FC<Props> = ({ abierto, onCerrar, onElegir }) => {
  const db = obtenerDb();
  const [consulta, setConsulta] = useState('');
  const [nueva, setNueva] = useState(false);
  const [form, setForm] = useState({ razon_social: '', rif: '', direccion: '', telefono: '' });
  const [gps, setGps] = useState<{ lat: number; lon: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clientes = useLive(() => buscarClientes(db, consulta, 30), [consulta], [] as LocalCliente[]);

  const ubicar = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => setGps({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => setError('No se pudo obtener la ubicación. Podrás completarla después.'),
      { enableHighAccuracy: true, timeout: 8000 }
    );

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const c = await crearProspectoLocal(db, { ...form, lat: gps?.lat, lon: gps?.lon });
      solicitarSync();
      setNueva(false);
      setForm({ razon_social: '', rif: '', direccion: '', telefono: '' });
      onElegir(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la farmacia');
    }
  };

  return (
    <Sheet abierto={abierto} titulo={nueva ? 'Nueva farmacia' : 'Elegir farmacia'} onCerrar={onCerrar}>
      {nueva ? (
        <form onSubmit={crear} className="space-y-3">
          <input className={campo} placeholder="Razón social *" value={form.razon_social} onChange={(e) => setForm({ ...form, razon_social: e.target.value })} required />
          <input className={campo} placeholder="RIF (J-12345678-9)" value={form.rif} onChange={(e) => setForm({ ...form, rif: e.target.value })} />
          <input className={campo} placeholder="Dirección" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
          <input className={campo} placeholder="Teléfono" inputMode="tel" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
          <button type="button" onClick={ubicar} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-100 font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-100">
            <LocateFixed className="h-4 w-4" />
            {gps ? `Ubicación guardada (${gps.lat.toFixed(4)}, ${gps.lon.toFixed(4)})` : 'Usar mi ubicación actual'}
          </button>
          <p className="text-xs text-slate-500">
            Queda como <strong>prospecto pendiente</strong>: podrás tomarle pedidos, pero se retendrán hasta que la mesa valide el RIF y la homologación con una droguería.
          </p>
          {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setNueva(false)} className="min-h-12 rounded-xl bg-slate-100 font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-100">Cancelar</button>
            <button type="submit" className="min-h-12 rounded-xl bg-teal-600 font-bold text-white">Guardar</button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input autoFocus type="search" value={consulta} onChange={(e) => setConsulta(e.target.value)} placeholder="Nombre, RIF o código" aria-label="Buscar farmacia" className={`${campo} pl-9`} />
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {clientes.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onElegir(c)} className="flex min-h-14 w-full items-center justify-between gap-3 py-2 text-left">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-900 dark:text-white">{c.nombre_comercial}</span>
                    <span className="block truncate text-xs text-slate-500">{[c.rif, c.brick].filter(Boolean).join(' · ')}</span>
                  </span>
                  {c.estado_validacion === 'prospecto_pendiente' && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">Prospecto</span>}
                  {c.segmento === 'vip' && <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-800 dark:bg-violet-950 dark:text-violet-300">VIP</span>}
                </button>
              </li>
            ))}
            {clientes.length === 0 && <li className="py-6 text-center text-sm text-slate-500">Sin resultados.</li>}
          </ul>
          <button type="button" onClick={() => setNueva(true)} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-teal-500 font-bold text-teal-700 dark:text-teal-300">
            <Plus className="h-4 w-4" /> Nueva farmacia (prospecto)
          </button>
        </div>
      )}
    </Sheet>
  );
};
