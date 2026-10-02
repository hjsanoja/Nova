import { useMemo, useState } from 'react';
import { MapPinCheck, Search, X } from 'lucide-react';
import { Sheet } from '../components/capture/Sheet';
import { Boton, Campo, Grupo, PasoUnidades, estiloInput } from '../components/ui/kit';
import { obtenerDb } from '../offline/db';
import { registrarVisita } from '../offline/crm';
import { solicitarSync } from '../offline/motor';
import { normalizar } from '../offline/busqueda';
import type { LocalCliente, LocalMedico, LocalProducto, LocalTarea, LocalVisita, ResultadoVisita } from '../offline/types';
import { nombreDeProducto } from '../vistas/logica';
import { RESULTADOS_FARMACIA, RESULTADOS_MEDICO, diaMas, leerUbicacion } from './datos';

export type DestinoVisita = { tipo: 'farmacia'; cliente: LocalCliente } | { tipo: 'medico'; medico: LocalMedico };

/**
 * Reporte de visita (pensado para el teléfono): resultado, objetivo, productos presentados, muestras, nota y próxima
 * acción. Se guarda con el GPS y la hora; funciona sin señal. La próxima acción con fecha queda como tarea.
 */
export function VisitaForm({ destino, vendedorId, productos, onCerrar, onGuardada }: {
  destino: DestinoVisita;
  vendedorId: string;
  productos: LocalProducto[];
  onCerrar: () => void;
  onGuardada: (r: { visita: LocalVisita; tarea: LocalTarea | null; conGps: boolean }) => void;
}) {
  const esMedico = destino.tipo === 'medico';
  const nombre = destino.tipo === 'medico' ? destino.medico.nombre : destino.cliente.nombre_comercial;
  const [resultado, setResultado] = useState<ResultadoVisita | null>(null);
  const [objetivo, setObjetivo] = useState('');
  const [presentados, setPresentados] = useState<string[]>([]);
  const [muestras, setMuestras] = useState<Record<string, number>>({});
  const [notas, setNotas] = useState('');
  const [accion, setAccion] = useState('');
  const [fecha, setFecha] = useState(diaMas(7));
  const [buscar, setBuscar] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const sugeridos = useMemo(() => {
    const palabras = normalizar(buscar).split(' ').filter(Boolean);
    if (!palabras.length) return [];
    return productos
      .filter((p) => p.activo !== false && !presentados.includes(p.id))
      .filter((p) => {
        const t = normalizar(`${p.nombre_comercial} ${p.presentacion ?? ''} ${p.principio_activo ?? ''} ${p.sku}`);
        return palabras.every((w) => t.includes(w));
      })
      .slice(0, 6);
  }, [buscar, productos, presentados]);

  const guardar = async () => {
    if (!resultado) return setError('Elige cómo resultó la visita.');
    if (accion.trim() && !fecha) return setError('Elige la fecha de la próxima acción.');
    setError('');
    setGuardando(true);
    try {
      const pos = await leerUbicacion();
      const r = await registrarVisita(obtenerDb(), {
        cliente_id: destino.tipo === 'farmacia' ? destino.cliente.id : null,
        medico_id: destino.tipo === 'medico' ? destino.medico.id : null,
        lat: pos?.coords.latitude, lon: pos?.coords.longitude, precision_gps_m: pos?.coords.accuracy,
        resultado, objetivo, notas, productos: presentados,
        muestras: Object.entries(muestras).map(([producto_id, cantidad]) => ({ producto_id, cantidad })),
        proxima_accion: accion, proxima_fecha: accion.trim() ? fecha : null,
      }, vendedorId);
      solicitarSync();
      onGuardada({ ...r, conGps: !!pos });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Sheet abierto titulo={`Visita a ${nombre}`} onCerrar={onCerrar}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">Se guarda con tu ubicación GPS y la hora. Funciona sin señal: se envía al volver la conexión.</p>

        <Grupo rotulo="¿Cómo resultó?">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Resultado de la visita">
            {(esMedico ? RESULTADOS_MEDICO : RESULTADOS_FARMACIA).map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={resultado === r.id}
                onClick={() => setResultado(r.id)}
                className={`min-h-11 rounded-xl border px-3 text-sm font-semibold transition-colors ${resultado === r.id ? 'border-marca-700 bg-marca-700 text-white' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'}`}
              >
                {r.texto}
              </button>
            ))}
          </div>
        </Grupo>

        <Campo rotulo="Objetivo de la visita (opcional)">
          <input value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder={esMedico ? 'Ej.: presentar Losartán 50 mg' : 'Ej.: recuperar el pedido mensual'} className={estiloInput} />
        </Campo>

        <Grupo rotulo="Productos presentados" ayuda={esMedico ? 'Indica las muestras que dejaste de cada uno.' : undefined}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar producto" aria-label="Buscar producto presentado" className={`${estiloInput} pl-9`} />
          </div>
          {sugeridos.length > 0 && (
            <ul className="mt-1 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              {sugeridos.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => { setPresentados((x) => [...x, p.id]); setBuscar(''); }} className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                    {nombreDeProducto(p)}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {presentados.length > 0 && (
            <ul className="mt-2 flex flex-col gap-2">
              {presentados.map((id) => (
                <li key={id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{nombreDeProducto(porId.get(id))}</span>
                  {esMedico && <PasoUnidades compacto valor={muestras[id] ?? 0} onChange={(n) => setMuestras((m) => ({ ...m, [id]: n }))} etiqueta={`Muestras de ${nombreDeProducto(porId.get(id))}`} />}
                  <button type="button" aria-label={`Quitar ${nombreDeProducto(porId.get(id))}`} onClick={() => { setPresentados((x) => x.filter((y) => y !== id)); setMuestras((m) => { const n = { ...m }; delete n[id]; return n; }); }} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700 dark:hover:bg-slate-700">
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Grupo>

        <Campo rotulo="Nota (opcional)">
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} placeholder="Lo que conversaron, objeciones, compromisos…" className={estiloInput} />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <Campo rotulo="Próxima acción (opcional)" ayuda="Con fecha, queda como tarea en «Mis tareas».">
            <input value={accion} onChange={(e) => setAccion(e.target.value)} placeholder="Ej.: llevar el estudio clínico" className={estiloInput} />
          </Campo>
          <Campo rotulo="Fecha">
            <input type="date" value={fecha} min={diaMas(0)} onChange={(e) => setFecha(e.target.value)} className={estiloInput} />
          </Campo>
        </div>

        {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="primario" icono={MapPinCheck} disabled={guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar visita'}</Boton>
        </div>
      </div>
    </Sheet>
  );
}
