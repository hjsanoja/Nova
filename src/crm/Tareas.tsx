import { useMemo, useState } from 'react';
import { CalendarClock, Check, ListTodo, Plus, Stethoscope, Store, Trash2 } from 'lucide-react';
import { Sheet } from '../components/capture/Sheet';
import { Boton, Campo, Etiqueta, estiloInput } from '../components/ui/kit';
import { obtenerDb } from '../offline/db';
import { cambiarEstadoTarea, eliminarTarea, guardarTarea } from '../offline/crm';
import { solicitarSync } from '../offline/motor';
import type { LocalCliente, LocalMedico, LocalTarea } from '../offline/types';
import { diaMas, fechaCorta } from './datos';

/** Nombre de la farmacia o el médico de una tarea. */
export function useNombresDestino(clientes: LocalCliente[], medicos: LocalMedico[]) {
  return useMemo(() => {
    const c = new Map(clientes.map((x) => [x.id, x.nombre_comercial]));
    const m = new Map(medicos.map((x) => [x.id, x.nombre]));
    return (t: Pick<LocalTarea, 'cliente_id' | 'medico_id'>) =>
      t.cliente_id ? { icono: Store, texto: c.get(t.cliente_id) ?? 'Farmacia' } : t.medico_id ? { icono: Stethoscope, texto: m.get(t.medico_id) ?? 'Médico' } : null;
  }, [clientes, medicos]);
}

/** Una tarea en una lista: casilla para marcarla hecha, a quién se refiere y cuándo vence. */
export function FilaTarea({ t, destino, responsable, hoy, onEditar }: {
  t: LocalTarea;
  destino: ReturnType<ReturnType<typeof useNombresDestino>>;
  responsable?: string;
  hoy: string;
  onEditar: () => void;
}) {
  const hecha = t.estado === 'hecha';
  const vencida = !hecha && t.vence_en < hoy;
  const Icono = destino?.icono;
  return (
    <li className="flex items-start gap-3 py-2.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={hecha}
        aria-label={hecha ? `Reabrir: ${t.titulo}` : `Marcar hecha: ${t.titulo}`}
        onClick={() => { void cambiarEstadoTarea(obtenerDb(), t, hecha ? 'pendiente' : 'hecha').then(() => solicitarSync()); }}
        className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${hecha ? 'border-marca-700 bg-marca-700 text-white' : 'border-slate-300 hover:border-marca-600 dark:border-slate-600'}`}
      >
        {hecha && <Check className="h-3.5 w-3.5" aria-hidden />}
      </button>
      <button type="button" onClick={onEditar} className="min-w-0 flex-1 text-left">
        <span className={`block text-sm font-medium ${hecha ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-white'}`}>{t.titulo}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          {destino && Icono && <span className="inline-flex min-w-0 items-center gap-1"><Icono className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">{destino.texto}</span></span>}
          {responsable && <span>{responsable}</span>}
          {t.origen === 'visita' && <span>de una visita</span>}
          {t.sync_estado !== 'sincronizado' && <span className="text-amber-700 dark:text-amber-300">sin enviar</span>}
        </span>
      </button>
      <Etiqueta tono={hecha ? 'neutro' : vencida ? 'peligro' : t.vence_en === hoy ? 'aviso' : 'neutro'} punto={!hecha}>
        {vencida ? `Venció ${fechaCorta(t.vence_en)}` : fechaCorta(t.vence_en)}
      </Etiqueta>
    </li>
  );
}

/** Crear o editar una tarea. `destinoFijo` la ata a una farmacia o un médico (desde su ficha). */
export function TareaForm({ inicial, sugerida, vendedorId, responsables, destinoFijo, clientes, medicos, onCerrar, onGuardada }: {
  inicial?: LocalTarea | null;
  /** Valores de partida de una tarea nueva (p. ej. desde «Farmacias en riesgo»). */
  sugerida?: { titulo: string; cliente_id?: string; medico_id?: string; origen?: LocalTarea['origen'] };
  vendedorId: string;
  /** Si viene, la gerencia elige a quién asignarla. */
  responsables?: { id: string; nombre: string }[];
  destinoFijo?: { cliente_id?: string; medico_id?: string; nombre: string };
  clientes: LocalCliente[];
  medicos: LocalMedico[];
  onCerrar: () => void;
  onGuardada: (t: LocalTarea) => void;
}) {
  const [titulo, setTitulo] = useState(inicial?.titulo ?? sugerida?.titulo ?? '');
  const [vence, setVence] = useState(inicial?.vence_en ?? diaMas(1));
  const [notas, setNotas] = useState(inicial?.notas ?? '');
  const [destino, setDestino] = useState(() => {
    const base = inicial ?? sugerida;
    return base?.cliente_id ? `c:${base.cliente_id}` : base?.medico_id ? `m:${base.medico_id}` : '';
  });
  const [responsable, setResponsable] = useState(inicial?.vendedor_id ?? vendedorId);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    setError('');
    try {
      const cliente_id = destinoFijo ? destinoFijo.cliente_id ?? null : destino.startsWith('c:') ? destino.slice(2) : null;
      const medico_id = destinoFijo ? destinoFijo.medico_id ?? null : destino.startsWith('m:') ? destino.slice(2) : null;
      const t = await guardarTarea(obtenerDb(), { ...(inicial ?? {}), id: inicial?.id, vendedor_id: responsable, titulo, vence_en: vence, notas, cliente_id, medico_id, origen: inicial?.origen ?? sugerida?.origen ?? 'manual', estado: inicial?.estado ?? 'pendiente' });
      solicitarSync();
      onGuardada(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!inicial || !window.confirm('¿Borrar esta tarea?')) return;
    await eliminarTarea(obtenerDb(), inicial);
    solicitarSync();
    onCerrar();
  };

  return (
    <Sheet abierto titulo={inicial ? 'Tarea' : 'Nueva tarea'} onCerrar={onCerrar}>
      <div className="flex flex-col gap-3">
        <Campo rotulo="¿Qué hay que hacer?">
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej.: llamar para confirmar el pedido" className={estiloInput} autoFocus />
        </Campo>
        <div className="flex flex-wrap gap-2">
          {[['Hoy', 0], ['Mañana', 1], ['En una semana', 7]].map(([t, n]) => (
            <button key={t} type="button" onClick={() => setVence(diaMas(n as number))} className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${vence === diaMas(n as number) ? 'border-marca-700 bg-marca-700 text-white' : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'}`}>{t}</button>
          ))}
        </div>
        <Campo rotulo="Fecha">
          <input type="date" value={vence} onChange={(e) => setVence(e.target.value)} className={estiloInput} />
        </Campo>
        {destinoFijo ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">Con: <b>{destinoFijo.nombre}</b></p>
        ) : (
          <Campo rotulo="Con (opcional)">
            <select value={destino} onChange={(e) => setDestino(e.target.value)} className={estiloInput}>
              <option value="">Nadie en particular</option>
              {clientes.length > 0 && <optgroup label="Farmacias">{clientes.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.nombre_comercial}</option>)}</optgroup>}
              {medicos.length > 0 && <optgroup label="Médicos">{medicos.map((m) => <option key={m.id} value={`m:${m.id}`}>{m.nombre}</option>)}</optgroup>}
            </select>
          </Campo>
        )}
        {responsables && responsables.length > 0 && (
          <Campo rotulo="Responsable">
            <select value={responsable} onChange={(e) => setResponsable(e.target.value)} className={estiloInput}>
              {responsables.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </Campo>
        )}
        <Campo rotulo="Nota (opcional)">
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={estiloInput} />
        </Campo>
        {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {inicial && <Boton variante="fantasma" icono={Trash2} onClick={() => void borrar()} className="mr-auto">Borrar</Boton>}
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="primario" disabled={guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar tarea'}</Boton>
        </div>
      </div>
    </Sheet>
  );
}

/** Tareas de una farmacia o un médico (en su ficha). */
export function TareasDe({ tareas, hoy, vendedorId, destino, clientes, medicos }: {
  tareas: LocalTarea[];
  hoy: string;
  vendedorId: string;
  destino: { cliente_id?: string; medico_id?: string; nombre: string };
  clientes: LocalCliente[];
  medicos: LocalMedico[];
}) {
  const [edicion, setEdicion] = useState<LocalTarea | null | 'nueva'>(null);
  const abiertas = tareas.filter((t) => t.estado === 'pendiente').sort((a, b) => a.vence_en.localeCompare(b.vence_en));
  const hechas = tareas.filter((t) => t.estado === 'hecha').sort((a, b) => (b.hecha_en ?? '').localeCompare(a.hecha_en ?? '')).slice(0, 5);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{abiertas.length ? `${abiertas.length} pendiente${abiertas.length === 1 ? '' : 's'}` : 'Sin tareas pendientes'}</p>
        <Boton tamano="sm" icono={Plus} onClick={() => setEdicion('nueva')}>Nueva tarea</Boton>
      </div>
      {abiertas.length + hechas.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500 dark:bg-slate-800/60"><ListTodo className="h-4 w-4" aria-hidden />Anota lo que tengas que hacer con {destino.nombre} y te lo recordamos.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {[...abiertas, ...hechas].map((t) => <FilaTarea key={t.id} t={t} destino={null} hoy={hoy} onEditar={() => setEdicion(t)} />)}
        </ul>
      )}
      {edicion && (
        <TareaForm inicial={edicion === 'nueva' ? null : edicion} vendedorId={vendedorId} destinoFijo={destino} clientes={clientes} medicos={medicos} onCerrar={() => setEdicion(null)} onGuardada={() => setEdicion(null)} />
      )}
    </div>
  );
}

export const IconoTareas = CalendarClock;
