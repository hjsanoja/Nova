import { useMemo, useState } from 'react';
import { CalendarClock, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Sheet } from '../components/capture/Sheet';
import { BarraSeleccion, Boton, Campo, Casilla, Dato, Etiqueta, Grupo, PageHeader, Pildoras, Segmentado, Tarjeta, Vacio, estiloInput, useAviso, useConfirmar, useSeleccion } from '../components/ui/kit';
import { obtenerDb } from '../offline/db';
import { sincronizarYa } from '../offline/motor';
import { anularActividad, guardarActividad } from '../offline/actividades';
import type { LocalActividad, LocalMotivo } from '../offline/types';
import { getSupabaseClient } from '../services/supabaseClient';
import type { Usuario } from '../types/pharmacy';
import { useUsuariosNube } from '../vistas/useDatos';
import { useFeriados, usePeriodo } from '../ciclos/datos';
import { fechaTexto } from '../ciclos/logica';
import { ESTADOS_ACTIVIDAD, diasDeActividad, diasEfectivos, problemasActividad, textoFechas } from './logica';
import { useActividades, useMotivos } from './datos';

type Seccion = 'por_aprobar' | 'todas' | 'motivos';
const formato = (n: number) => n.toLocaleString('es-VE', { maximumFractionDigits: 1 });
const dias = (n: number) => `${formato(n)} día${n === 1 ? '' : 's'} hábil${n === 1 ? '' : 'es'}`;

/**
 * Otras actividades y días libres. El representante reporta (también sin señal) vacaciones, reuniones de ciclo,
 * impulsos…; su gerente o la administración los aprueban. Lo aprobado de motivos que descuentan no cuenta para su
 * cobertura de visitas del ciclo. La administración define los motivos.
 */
export function ActividadesVista({ usuario }: { usuario: Usuario }) {
  const esVendedor = usuario.rol === 'vendedor';
  return esVendedor ? <MisActividades usuario={usuario} /> : <Gestion usuario={usuario} />;
}

/* --------------------------------- representante --------------------------------- */

function MisActividades({ usuario }: { usuario: Usuario }) {
  const motivos = useMotivos();
  const feriados = useFeriados();
  const todas = useActividades();
  const periodo = usePeriodo(usuario);
  const [edicion, setEdicion] = useState<Partial<LocalActividad> | null>(null);
  const { mostrar, nodo } = useAviso();
  const { confirmar, nodo: nodoConfirmar } = useConfirmar();
  const mias = useMemo(() => todas.filter((a) => a.vendedor_id === usuario.id).sort((a, b) => b.desde.localeCompare(a.desde)), [todas, usuario.id]);
  const ef = diasEfectivos(mias, motivos, usuario.id, periodo, feriados, usuario.estado_geografico);
  const pendientes = mias.filter((a) => a.estado === 'pendiente').length;

  const anular = async (a: LocalActividad) => {
    if (!(await confirmar('Anular la actividad', `${nombreMotivo(motivos, a.motivo_id)} ${textoFechas(a)}. Esos días vuelven a contar para tu cobertura.`, { accion: 'Anular', peligro: true }))) return;
    await anularActividad(obtenerDb(), a);
    void sincronizarYa();
    mostrar({ tipo: 'ok', texto: 'Actividad anulada.' });
  };

  return (
    <div>
      <PageHeader
        titulo="Mis actividades"
        descripcion="Reporta días libres u otras actividades (vacaciones, reunión de ciclo, impulso…). Tu gerente las aprueba; lo aprobado no cuenta para tu cobertura de visitas."
        acciones={<Boton variante="primario" icono={Plus} onClick={() => setEdicion({})}>Reportar</Boton>}
      />
      {nodo}
      {nodoConfirmar}
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Dato icono={CalendarClock} rotulo={periodo.tipo === 'ciclo' ? `Ciclo ${periodo.ciclo?.nombre ?? ''}` : `Mes de ${periodo.etiqueta}`} valor={dias(ef.habiles)} nota="Días hábiles del período" />
        <Dato rotulo="Días libres aprobados" valor={formato(ef.libres)} nota="Se descuentan de tu cobertura" />
        <Dato rotulo="Días efectivos" valor={formato(ef.efectivos)} nota="Días para visitar" />
        <Dato rotulo="Por aprobar" valor={pendientes} tono={pendientes ? 'aviso' : undefined} nota={usuario.gerente_id ? 'Las aprueba tu gerente' : 'Las aprueba la administración'} />
      </div>
      <Tarjeta className="!p-0">
        {mias.length === 0 ? (
          <Vacio icono={CalendarClock} titulo="Aún no reportas actividades" texto="Toca «Reportar» cuando tengas vacaciones, una reunión de ciclo, un impulso u otra actividad que no sea visitar." />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {mias.map((a) => (
              <FilaActividad key={a.id} a={a} motivos={motivos} dias={diasDeActividad(a, { desde: a.desde, hasta: a.hasta }, feriados, usuario.estado_geografico)}>
                {a.estado === 'pendiente' && a.sync_estado !== 'error' && <Boton tamano="sm" variante="fantasma" icono={Pencil} aria-label="Cambiar" onClick={() => setEdicion(a)} />}
                {a.estado === 'pendiente' && <Boton tamano="sm" variante="fantasma" icono={Trash2} aria-label="Anular" onClick={() => void anular(a)} />}
              </FilaActividad>
            ))}
          </ul>
        )}
      </Tarjeta>
      {edicion && (
        <FormActividad
          inicial={edicion}
          vendedorId={usuario.id}
          motivos={motivos}
          otras={mias}
          feriados={feriados}
          estado={usuario.estado_geografico}
          onCerrar={() => setEdicion(null)}
          onGuardada={(a) => {
            setEdicion(null);
            void sincronizarYa();
            const m = motivos.find((x) => x.id === a.motivo_id);
            mostrar({ tipo: 'ok', texto: m && !m.requiere_aprobacion ? `${m.nombre} registrada (no requiere aprobación).` : `${m?.nombre ?? 'Actividad'} enviada a ${usuario.gerente_id ? 'tu gerente' : 'la administración'} para aprobar.` });
          }}
        />
      )}
    </div>
  );
}

const nombreMotivo = (motivos: LocalMotivo[], id: string) => motivos.find((m) => m.id === id)?.nombre ?? 'Actividad';

function FilaActividad({ a, motivos, dias: n, quien, children, seleccion }: { a: LocalActividad; motivos: LocalMotivo[]; dias: number; quien?: string; children?: React.ReactNode; seleccion?: React.ReactNode }) {
  const e = ESTADOS_ACTIVIDAD[a.estado];
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2.5">
      {seleccion}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold">
          {quien && <span>{quien} ·</span>}
          <span>{nombreMotivo(motivos, a.motivo_id)}</span>
          <Etiqueta tono={e.tono} punto>{e.texto}</Etiqueta>
          {a.sync_estado === 'pendiente' && <Etiqueta tono="neutro">Sin enviar</Etiqueta>}
          {a.sync_estado === 'error' && <Etiqueta tono="peligro">No se pudo enviar</Etiqueta>}
        </p>
        <p className="text-xs text-slate-500">{textoFechas(a)[0].toUpperCase() + textoFechas(a).slice(1)} · {dias(n)}{a.notas ? ` · ${a.notas}` : ''}</p>
        {a.comentario && <p className="text-xs text-slate-600 dark:text-slate-300">Comentario: {a.comentario}</p>}
        {a.sync_estado === 'error' && a.sync_error && <p className="text-xs text-rose-700 dark:text-rose-300">{a.sync_error}</p>}
      </div>
      {children}
    </li>
  );
}

type Modo = 'dia' | 'varios' | 'media';

function FormActividad({ inicial, vendedorId, motivos, otras, feriados, estado, onCerrar, onGuardada }: {
  inicial: Partial<LocalActividad>;
  vendedorId: string;
  motivos: LocalMotivo[];
  otras: LocalActividad[];
  feriados: Parameters<typeof diasDeActividad>[2];
  estado?: string | null;
  onCerrar: () => void;
  onGuardada: (a: LocalActividad) => void;
}) {
  const activos = motivos.filter((m) => m.activo || m.id === inicial.motivo_id);
  const hoy = fechaTexto(new Date());
  const [motivoId, setMotivoId] = useState(inicial.motivo_id ?? activos[0]?.id ?? '');
  const [modo, setModo] = useState<Modo>(inicial.jornada === 'media' ? 'media' : inicial.hasta && inicial.hasta !== inicial.desde ? 'varios' : 'dia');
  const [desde, setDesde] = useState(inicial.desde ?? hoy);
  const [hasta, setHasta] = useState(inicial.hasta ?? inicial.desde ?? hoy);
  const [notas, setNotas] = useState(inicial.notas ?? '');
  const [error, setError] = useState('');
  const fila = { id: inicial.id ?? '', motivo_id: motivoId, desde, hasta: modo === 'varios' ? hasta : desde, jornada: modo === 'media' ? ('media' as const) : ('completa' as const) };
  const problemas = problemasActividad(fila, otras, motivos);
  const n = problemas.length ? 0 : diasDeActividad(fila, { desde: fila.desde, hasta: fila.hasta }, feriados, estado);
  const motivo = motivos.find((m) => m.id === motivoId);

  const guardar = async () => {
    try {
      const a = await guardarActividad(obtenerDb(), { id: inicial.id, vendedor_id: vendedorId, motivo_id: motivoId, desde: fila.desde, hasta: fila.hasta, jornada: fila.jornada, notas });
      onGuardada(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Sheet abierto titulo={inicial.id ? 'Cambiar actividad' : 'Reportar actividad'} onCerrar={onCerrar}>
      <div className="flex flex-col gap-3">
        <Campo rotulo="Motivo">
          <select value={motivoId} onChange={(e) => setMotivoId(e.target.value)} className={estiloInput}>
            {activos.length === 0 && <option value="">Sin motivos (la administración los define)</option>}
            {activos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
        </Campo>
        {motivo && (
          <p className="-mt-1 text-xs text-slate-500">
            {motivo.requiere_aprobacion ? 'Necesita aprobación de tu gerente.' : 'No necesita aprobación.'} {motivo.descuenta ? 'Esos días no cuentan para tu cobertura de visitas.' : 'No descuenta días de tu cobertura.'}
          </p>
        )}
        <Grupo rotulo="¿Cuánto tiempo?">
          <Pildoras valor={modo} onChange={setModo} etiqueta="Duración" opciones={[{ id: 'dia', texto: 'Un día' }, { id: 'varios', texto: 'Varios días' }, { id: 'media', texto: 'Media jornada' }]} />
        </Grupo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo={modo === 'varios' ? 'Desde' : 'Fecha'}><input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); if (hasta < e.target.value) setHasta(e.target.value); }} className={estiloInput} /></Campo>
          {modo === 'varios' && <Campo rotulo="Hasta"><input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className={estiloInput} /></Campo>}
        </div>
        <Campo rotulo="Nota (opcional)"><input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej.: Lanzamiento en Maracaibo" className={estiloInput} /></Campo>
        {problemas.length > 0 ? (
          <div role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{problemas.map((p) => <p key={p}>{p}</p>)}</div>
        ) : (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60"><b>{dias(n)}</b>{n === 0 ? ' (fin de semana o feriado: no descuenta nada)' : ''}</p>
        )}
        {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="primario" disabled={problemas.length > 0} onClick={() => void guardar()}>{inicial.id ? 'Guardar cambios' : 'Enviar'}</Boton>
        </div>
      </div>
    </Sheet>
  );
}

/* ------------------------------ gerencia y administración ------------------------------ */

function Gestion({ usuario }: { usuario: Usuario }) {
  const esAdmin = usuario.rol === 'admin';
  const motivos = useMotivos();
  const feriados = useFeriados();
  const todas = useActividades();
  const { usuarios } = useUsuariosNube();
  const [seccion, setSeccion] = useState<Seccion>('por_aprobar');
  const [representante, setRepresentante] = useState('');
  const [rechazando, setRechazando] = useState<string[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const sel = useSeleccion();
  const { mostrar, nodo } = useAviso();
  const { confirmar, nodo: nodoConfirmar } = useConfirmar();

  const persona = useMemo(() => new Map(usuarios.map((u) => [u.id, u])), [usuarios]);
  const nombre = (id: string) => persona.get(id)?.nombre_completo ?? 'Representante';
  // Puede decidir: la administración, todas; un gerente, las de los representantes que tiene asignados.
  const puedeDecidir = (a: LocalActividad) => esAdmin || persona.get(a.vendedor_id)?.gerente_id === usuario.id;
  const pendientes = todas.filter((a) => a.estado === 'pendiente' && a.sync_estado !== 'error').sort((a, b) => a.desde.localeCompare(b.desde));
  const misPendientes = pendientes.filter(puedeDecidir);
  const deOtros = pendientes.length - misPendientes.length;
  const lista = (seccion === 'por_aprobar' ? misPendientes : [...todas].sort((a, b) => b.desde.localeCompare(a.desde))).filter((a) => !representante || a.vendedor_id === representante);
  const vendedores = usuarios.filter((u) => u.rol === 'vendedor' && u.activo);
  const diasDe = (a: LocalActividad) => diasDeActividad(a, { desde: a.desde, hasta: a.hasta }, feriados, persona.get(a.vendedor_id)?.estado_geografico);

  const decidir = async (ids: string[], aprobar: boolean, comentario?: string) => {
    const sb = getSupabaseClient();
    if (!sb || !ids.length) return;
    setOcupado(true);
    const { data, error } = await sb.rpc('decidir_actividades', { p_ids: ids, p_aprobar: aprobar, p_comentario: comentario ?? null });
    setOcupado(false);
    if (error) return mostrar({ tipo: 'error', texto: error.message });
    await obtenerDb().actividades.where('id').anyOf(ids).modify({ estado: aprobar ? 'aprobada' : 'rechazada', comentario: comentario?.trim() || null, decidido_por: usuario.id, decidido_en: new Date().toISOString() });
    sel.limpiar();
    setRechazando(null);
    void sincronizarYa();
    const n = Number(data ?? ids.length);
    mostrar({ tipo: 'ok', texto: `${n} actividad${n === 1 ? '' : 'es'} ${aprobar ? 'aprobada' : 'rechazada'}${n === 1 ? '' : 's'}. ${n === 1 ? 'El representante recibe' : 'Los representantes reciben'} el aviso.` });
  };

  const anular = async (a: LocalActividad) => {
    if (!(await confirmar('Anular la actividad', `${nombre(a.vendedor_id)}: ${nombreMotivo(motivos, a.motivo_id)} ${textoFechas(a)}. Esos días vuelven a contar para su cobertura.`, { accion: 'Anular', peligro: true }))) return;
    await anularActividad(obtenerDb(), a);
    void sincronizarYa();
  };

  return (
    <div>
      <PageHeader titulo="Actividades" descripcion="Días libres y otras actividades de los representantes. Aprueba su gerente o la administración; lo aprobado no cuenta para la cobertura de visitas." />
      {nodo}
      {nodoConfirmar}
      <Segmentado
        valor={seccion}
        onChange={(s) => { setSeccion(s); sel.limpiar(); }}
        opciones={[{ id: 'por_aprobar', texto: 'Por aprobar', cuenta: misPendientes.length || undefined }, { id: 'todas', texto: 'Todas' }, ...(esAdmin ? [{ id: 'motivos' as const, texto: 'Motivos' }] : [])]}
      />
      {seccion === 'motivos' ? (
        <Motivos motivos={motivos} mostrar={mostrar} />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select value={representante} onChange={(e) => setRepresentante(e.target.value)} aria-label="Representante" className={`${estiloInput} w-auto`}>
              <option value="">Todos los representantes</option>
              {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre_completo}</option>)}
            </select>
            {seccion === 'por_aprobar' && deOtros > 0 && <span className="text-xs text-slate-500">{deOtros} más esperan a otro gerente.</span>}
          </div>
          <BarraSeleccion cantidad={sel.cantidad} onLimpiar={sel.limpiar}>
            <Boton tamano="sm" variante="primario" icono={Check} disabled={ocupado} onClick={() => void decidir([...sel.ids], true)}>Aprobar {sel.cantidad}</Boton>
            <Boton tamano="sm" variante="peligro" icono={X} disabled={ocupado} onClick={() => setRechazando([...sel.ids])}>Rechazar</Boton>
          </BarraSeleccion>
          <Tarjeta className="!p-0">
            {lista.length === 0 ? (
              <Vacio icono={CalendarClock} titulo={seccion === 'por_aprobar' ? 'Nada por aprobar' : 'Sin actividades reportadas'} texto={seccion === 'por_aprobar' ? 'Cuando un representante reporte un día libre o una actividad, aparece aquí y te llega un aviso.' : undefined} />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {seccion === 'por_aprobar' && (
                  <li className="flex items-center gap-1 bg-slate-50 px-1 text-xs font-medium text-slate-500 dark:bg-slate-950">
                    <Casilla etiqueta="Seleccionar todas" marcada={lista.every((a) => sel.tiene(a.id))} parcial={lista.some((a) => sel.tiene(a.id)) && !lista.every((a) => sel.tiene(a.id))} onChange={(v) => sel.fijarTodos(lista.map((a) => a.id), v)} />
                    {lista.length} por aprobar
                  </li>
                )}
                {lista.map((a) => (
                  <FilaActividad
                    key={a.id}
                    a={a}
                    motivos={motivos}
                    dias={diasDe(a)}
                    quien={nombre(a.vendedor_id)}
                    seleccion={seccion === 'por_aprobar' ? <Casilla etiqueta={`Seleccionar ${nombre(a.vendedor_id)}`} marcada={sel.tiene(a.id)} onChange={() => sel.alternar(a.id)} /> : undefined}
                  >
                    {a.estado === 'pendiente' && puedeDecidir(a) && (
                      <>
                        <Boton tamano="sm" variante="primario" icono={Check} disabled={ocupado} onClick={() => void decidir([a.id], true)}>Aprobar</Boton>
                        <Boton tamano="sm" icono={X} disabled={ocupado} onClick={() => setRechazando([a.id])}>Rechazar</Boton>
                      </>
                    )}
                    {seccion === 'todas' && a.estado === 'aprobada' && puedeDecidir(a) && <Boton tamano="sm" variante="fantasma" icono={Trash2} aria-label={`Anular ${nombreMotivo(motivos, a.motivo_id)} de ${nombre(a.vendedor_id)}`} onClick={() => void anular(a)} />}
                  </FilaActividad>
                ))}
              </ul>
            )}
          </Tarjeta>
        </>
      )}
      {rechazando && <Rechazo cantidad={rechazando.length} ocupado={ocupado} onCerrar={() => setRechazando(null)} onRechazar={(c) => void decidir(rechazando, false, c)} />}
    </div>
  );
}

function Rechazo({ cantidad, ocupado, onCerrar, onRechazar }: { cantidad: number; ocupado: boolean; onCerrar: () => void; onRechazar: (comentario: string) => void }) {
  const [comentario, setComentario] = useState('');
  return (
    <Sheet abierto titulo={cantidad === 1 ? 'Rechazar actividad' : `Rechazar ${cantidad} actividades`} onCerrar={onCerrar}>
      <div className="flex flex-col gap-3">
        <Campo rotulo="¿Por qué?" ayuda="El representante lo verá en su aviso."><textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3} className={estiloInput} /></Campo>
        <div className="flex justify-end gap-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="peligro" disabled={!comentario.trim() || ocupado} onClick={() => onRechazar(comentario.trim())}>Rechazar</Boton>
        </div>
      </div>
    </Sheet>
  );
}

/* ----------------------------------- motivos ----------------------------------- */

const COLUMNAS_MOTIVO = 'id,nombre,descuenta,requiere_aprobacion,activo,orden,updated_at';

function Motivos({ motivos, mostrar }: { motivos: LocalMotivo[]; mostrar: (a: { tipo: 'ok' | 'error'; texto: string }) => void }) {
  const [nuevo, setNuevo] = useState('');
  const [editando, setEditando] = useState<{ id: string; nombre: string } | null>(null);

  // Lo guardado se escribe también en el dispositivo: se ve al instante sin esperar la descarga.
  const aplicar = async (consulta: PromiseLike<{ data: unknown; error: { message: string } | null }>, aviso?: string) => {
    const { data, error } = await consulta;
    if (error) return mostrar({ tipo: 'error', texto: /uq_motivo/.test(error.message) ? 'Ya hay un motivo con ese nombre.' : error.message });
    if (Array.isArray(data)) await obtenerDb().motivos.bulkPut(data as LocalMotivo[]);
    if (aviso) mostrar({ tipo: 'ok', texto: aviso });
    void sincronizarYa();
    return true;
  };
  const sb = () => getSupabaseClient();
  const agregar = async () => {
    const c = sb();
    if (!c || !nuevo.trim()) return;
    if (await aplicar(c.from('motivos_actividad').insert({ nombre: nuevo.trim(), orden: (motivos.at(-1)?.orden ?? 0) + 1 }).select(COLUMNAS_MOTIVO), `Motivo «${nuevo.trim()}» agregado.`)) setNuevo('');
  };
  const cambiar = (m: LocalMotivo, parche: Partial<LocalMotivo>, aviso?: string) => {
    const c = sb();
    if (c) void aplicar(c.from('motivos_actividad').update(parche).eq('id', m.id).select(COLUMNAS_MOTIVO), aviso);
  };

  return (
    <Tarjeta>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">Los motivos que el representante puede elegir. «Descuenta» quita esos días de la cobertura de visitas; sin «Requiere aprobación» queda aprobada al reportarla. Un motivo inactivo ya no se puede elegir (lo reportado se conserva).</p>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {motivos.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
            {editando?.id === m.id ? (
              <form className="flex min-w-0 flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); if (editando.nombre.trim()) cambiar(m, { nombre: editando.nombre.trim() }, 'Motivo renombrado.'); setEditando(null); }}>
                <input value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} aria-label="Nombre del motivo" className={estiloInput} autoFocus />
                <Boton type="submit" tamano="sm" variante="primario">Guardar</Boton>
              </form>
            ) : (
              <button type="button" onClick={() => setEditando({ id: m.id, nombre: m.nombre })} className={`min-w-0 flex-1 truncate text-left text-sm font-semibold hover:underline ${m.activo ? '' : 'text-slate-400 line-through'}`}>{m.nombre}</button>
            )}
            <label className="flex items-center gap-1.5 text-xs"><Casilla etiqueta={`Descuenta: ${m.nombre}`} marcada={m.descuenta} onChange={(v) => cambiar(m, { descuenta: v })} />Descuenta</label>
            <label className="flex items-center gap-1.5 text-xs"><Casilla etiqueta={`Requiere aprobación: ${m.nombre}`} marcada={m.requiere_aprobacion} onChange={(v) => cambiar(m, { requiere_aprobacion: v })} />Requiere aprobación</label>
            <label className="flex items-center gap-1.5 text-xs"><Casilla etiqueta={`Activo: ${m.nombre}`} marcada={m.activo} onChange={(v) => cambiar(m, { activo: v })} />Activo</label>
          </li>
        ))}
      </ul>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void agregar(); }}>
        <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Nuevo motivo (ej.: Jornada médica)" aria-label="Nuevo motivo" className={estiloInput} />
        <Boton type="submit" variante="primario" icono={Plus} disabled={!nuevo.trim()}>Agregar</Boton>
      </form>
    </Tarjeta>
  );
}
