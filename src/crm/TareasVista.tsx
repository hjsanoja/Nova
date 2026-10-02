import { useMemo, useState } from 'react';
import { CheckCircle2, ListTodo, Plus } from 'lucide-react';
import { Boton, PageHeader, Tarjeta, Vacio, estiloInput } from '../components/ui/kit';
import { agruparTareas, hoyTexto } from '../offline/crm';
import type { GrupoTarea } from '../offline/crm';
import type { LocalTarea } from '../offline/types';
import type { Usuario } from '../types/pharmacy';
import { useClientes, useUsuariosNube } from '../vistas/useDatos';
import { useMedicos, useTareas } from './datos';
import { FilaTarea, TareaForm, useNombresDestino } from './Tareas';

const GRUPOS: { id: GrupoTarea; titulo: string; vacio?: string }[] = [
  { id: 'vencidas', titulo: 'Vencidas' },
  { id: 'hoy', titulo: 'Hoy', vacio: 'Nada para hoy.' },
  { id: 'proximas', titulo: 'Próximas' },
];

/**
 * Mis tareas: lo que hay que hacer, agrupado en vencidas, hoy y próximas. Se marca hecha con un toque y funciona sin
 * señal. La gerencia ve las de todo el equipo y puede asignar tareas a un representante.
 */
export function TareasVista({ usuario }: { usuario: Usuario }) {
  const tareas = useTareas();
  const clientes = useClientes();
  const medicos = useMedicos();
  const { usuarios } = useUsuariosNube();
  const gestiona = usuario.rol === 'admin' || usuario.rol === 'gerente';
  const [de, setDe] = useState(gestiona ? '' : usuario.id);
  const [edicion, setEdicion] = useState<LocalTarea | 'nueva' | null>(null);
  const [verHechas, setVerHechas] = useState(false);
  const destino = useNombresDestino(clientes, medicos);
  const hoy = hoyTexto();

  const propias = useMemo(() => (de ? tareas.filter((t) => t.vendedor_id === de) : tareas), [tareas, de]);
  const grupos = useMemo(() => agruparTareas(propias), [propias]);
  const responsables = gestiona ? [{ id: usuario.id, nombre: `${usuario.nombre_completo} (yo)` }, ...usuarios.filter((u) => u.activo && u.id !== usuario.id && (u.rol === 'vendedor' || u.rol === 'gerente')).map((u) => ({ id: u.id, nombre: u.nombre_completo }))] : undefined;
  const nombre = (id: string) => usuarios.find((u) => u.id === id)?.nombre_completo ?? 'Representante';
  const abiertas = grupos.vencidas.length + grupos.hoy.length + grupos.proximas.length;

  return (
    <div>
      <PageHeader
        titulo={gestiona ? 'Tareas' : 'Mis tareas'}
        descripcion={abiertas ? `${abiertas} pendiente${abiertas === 1 ? '' : 's'}${grupos.vencidas.length ? ` · ${grupos.vencidas.length} vencida${grupos.vencidas.length === 1 ? '' : 's'}` : ''}. El día que vence una tarea te llega un aviso.` : 'Anota lo que tienes que hacer y te lo recordamos el día que toca.'}
        acciones={<Boton variante="primario" icono={Plus} onClick={() => setEdicion('nueva')}>Nueva tarea</Boton>}
      />
      {gestiona && (
        <div className="mb-3">
          <select value={de} onChange={(e) => setDe(e.target.value)} aria-label="De quién" className={`${estiloInput} w-auto`}>
            <option value="">Todo el equipo</option>
            <option value={usuario.id}>Mías</option>
            {usuarios.filter((u) => u.activo && u.id !== usuario.id && u.rol === 'vendedor').map((u) => <option key={u.id} value={u.id}>{u.nombre_completo}</option>)}
          </select>
        </div>
      )}

      {abiertas === 0 && grupos.hechas.length === 0 ? (
        <Tarjeta>
          <Vacio icono={ListTodo} titulo="Sin tareas" texto="Crea una tarea aquí, desde la ficha de una farmacia o un médico, o como «próxima acción» al registrar una visita." accion={<Boton variante="primario" icono={Plus} onClick={() => setEdicion('nueva')}>Nueva tarea</Boton>} />
        </Tarjeta>
      ) : (
        <div className="flex flex-col gap-4">
          {GRUPOS.filter((g) => grupos[g.id].length > 0 || g.vacio).map((g) => (
            <Tarjeta key={g.id}>
              <h2 className={`mb-1 text-sm font-semibold ${g.id === 'vencidas' ? 'text-rose-700 dark:text-rose-300' : 'text-slate-900 dark:text-white'}`}>{g.titulo} · {grupos[g.id].length}</h2>
              {grupos[g.id].length === 0 ? (
                <p className="py-2 text-sm text-slate-500">{g.vacio}</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {grupos[g.id].map((t) => <FilaTarea key={t.id} t={t} destino={destino(t)} responsable={gestiona && !de ? nombre(t.vendedor_id) : undefined} hoy={hoy} onEditar={() => setEdicion(t)} />)}
                </ul>
              )}
            </Tarjeta>
          ))}
          {grupos.hechas.length > 0 && (
            <Tarjeta>
              <button type="button" onClick={() => setVerHechas((v) => !v)} className="flex w-full items-center gap-2 text-left text-sm font-semibold text-slate-700 dark:text-slate-200">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> Hechas · {grupos.hechas.length} <span className="ml-auto text-xs font-medium text-marca-700 dark:text-marca-300">{verHechas ? 'Ocultar' : 'Ver'}</span>
              </button>
              {verHechas && (
                <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-800">
                  {grupos.hechas.slice(0, 30).map((t) => <FilaTarea key={t.id} t={t} destino={destino(t)} hoy={hoy} onEditar={() => setEdicion(t)} />)}
                </ul>
              )}
            </Tarjeta>
          )}
        </div>
      )}

      {edicion && (
        <TareaForm
          inicial={edicion === 'nueva' ? null : edicion}
          vendedorId={de || usuario.id}
          responsables={responsables}
          clientes={clientes}
          medicos={medicos}
          onCerrar={() => setEdicion(null)}
          onGuardada={() => setEdicion(null)}
        />
      )}
    </div>
  );
}
