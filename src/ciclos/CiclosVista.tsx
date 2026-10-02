import { useMemo, useState } from 'react';
import { CalendarPlus, CalendarRange, Lock, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Sheet } from '../components/capture/Sheet';
import { Boton, Campo, Casilla, Etiqueta, Grupo, PageHeader, Segmentado, Subtitulo, Tarjeta, Vacio, estiloInput, useAviso, useConfirmar } from '../components/ui/kit';
import { obtenerDb } from '../offline/db';
import { sincronizarYa } from '../offline/motor';
import type { LocalCiclo, LocalFeriado } from '../offline/types';
import { getSupabaseClient } from '../services/supabaseClient';
import type { Usuario } from '../types/pharmacy';
import { useCiclos, useEquipos, useFeriados } from './datos';
import type { Equipo } from './datos';
import {
  ESTADOS_VENEZUELA, ciclosDe, diaHabilCercano, diasEntre, diasHabiles, estadoCiclo, fechaBreve, fechaTexto, feriadosVenezuela, huecosCiclo, problemasCiclo,
  proponerPrimero, proponerSiguiente,
} from './logica';
import type { EstadoCiclo } from './logica';

// Lo que guarda la administración se escribe también en el dispositivo: se ve al instante sin esperar la descarga.
const COLUMNAS_CICLO = 'id,equipo_id,nombre,inicio,fin,notas,cerrado_en,updated_at';
const COLUMNAS_FERIADO = 'id,fecha,nombre,alcance,estados,updated_at';
const aFeriadoLocal = (f: LocalFeriado): LocalFeriado => ({ ...f, estados: f.estados ?? [] });

const ESTADO: Record<EstadoCiclo, { texto: string; tono: 'marca' | 'exito' | 'neutro' | 'aviso' }> = {
  vigente: { texto: 'Vigente', tono: 'exito' },
  planificado: { texto: 'Próximo', tono: 'marca' },
  terminado: { texto: 'Terminado', tono: 'aviso' },
  cerrado: { texto: 'Cerrado', tono: 'neutro' },
};

type Borrador = { id?: string; equipo_id: string | null; nombre: string; inicio: string; fin: string; notas?: string | null };

/**
 * Ciclos de trabajo por equipo y calendario de feriados. Todo (pedidos, visitas, metas) se mide por el ciclo vigente del
 * equipo; si el equipo no tiene ciclo se usa el general, y sin ninguno, el mes. Solo la administración los define.
 */
export function CiclosVista({ usuario }: { usuario: Usuario }) {
  const ciclos = useCiclos();
  const feriados = useFeriados();
  const equipos = useEquipos(ciclos);
  const esAdmin = usuario.rol === 'admin';
  const [seccion, setSeccion] = useState<'ciclos' | 'feriados'>('ciclos');
  const [edicion, setEdicion] = useState<Borrador | null>(null);
  const { mostrar, nodo } = useAviso();
  const { confirmar, nodo: nodoConfirmar } = useConfirmar();
  const hoy = fechaTexto(new Date());
  const grupos: { id: string | null; nombre: string }[] = [...equipos.map((e) => ({ id: e.id, nombre: e.nombre })), { id: null, nombre: 'General (equipos sin ciclo propio)' }];

  const eliminar = async (c: LocalCiclo) => {
    const sb = getSupabaseClient();
    if (!sb || !(await confirmar(`Eliminar ${c.nombre}`, 'Se eliminan también sus metas. Los pedidos y visitas no cambian.', { accion: 'Eliminar', peligro: true }))) return;
    const { error } = await sb.from('ciclos').update({ deleted_at: new Date().toISOString() }).eq('id', c.id);
    if (error) return mostrar({ tipo: 'error', texto: error.message });
    await obtenerDb().ciclos.delete(c.id);
    mostrar({ tipo: 'ok', texto: `${c.nombre} eliminado.` });
    void sincronizarYa();
  };

  const cerrar = async (c: LocalCiclo) => {
    const sb = getSupabaseClient();
    if (!sb || !(await confirmar(`Cerrar ${c.nombre}`, 'Se guarda la foto de los resultados de sus metas (no cambia aunque luego se corrijan pedidos o visitas). NOVA también los cierra sola al día siguiente de terminar.', { accion: 'Cerrar ciclo' }))) return;
    const { data, error } = await sb.rpc('cerrar_ciclo', { p_ciclo: c.id });
    if (error) return mostrar({ tipo: 'error', texto: error.message });
    await obtenerDb().ciclos.update(c.id, { cerrado_en: new Date().toISOString() });
    mostrar({ tipo: 'ok', texto: `${c.nombre} cerrado: ${data} resultado${data === 1 ? '' : 's'} guardado${data === 1 ? '' : 's'}.` });
    void sincronizarYa();
  };

  return (
    <div>
      <PageHeader
        titulo="Ciclos"
        descripcion="Cada equipo tiene sus ciclos (normalmente 4 semanas). Empiezan y terminan en días hábiles; todo se mide por el ciclo vigente."
        acciones={esAdmin && seccion === 'ciclos' ? <Boton variante="primario" icono={Plus} onClick={() => setEdicion({ equipo_id: equipos[0]?.id ?? null, ...proponerPrimero(hoy, feriados) })}>Nuevo ciclo</Boton> : undefined}
      />
      {nodo}
      {nodoConfirmar}
      <Segmentado valor={seccion} onChange={setSeccion} opciones={[{ id: 'ciclos', texto: 'Ciclos' }, { id: 'feriados', texto: 'Feriados', cuenta: feriados.filter((f) => f.fecha >= hoy).length || undefined }]} />

      {seccion === 'ciclos' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {grupos.map((g) => {
            const lista = ciclosDe(ciclos, g.id);
            const vigente = lista.find((c) => estadoCiclo(c, hoy) === 'vigente');
            const ultimo = lista[0];
            if (!g.id && lista.length === 0 && !esAdmin) return null;
            return (
              <Tarjeta key={g.id ?? 'general'}>
                <Subtitulo
                  accion={esAdmin ? (
                    <Boton tamano="sm" icono={CalendarPlus} onClick={() => setEdicion({ equipo_id: g.id, ...(ultimo ? proponerSiguiente(ultimo, feriados) : proponerPrimero(hoy, feriados)) })}>
                      {ultimo ? 'Crear el siguiente' : 'Primer ciclo'}
                    </Boton>
                  ) : undefined}
                >
                  {g.nombre}
                </Subtitulo>
                {vigente ? (
                  <p className="mb-3 rounded-xl bg-marca-50 px-3 py-2 text-sm text-marca-900 dark:bg-marca-950/40 dark:text-marca-200">
                    Vigente: <b>{vigente.nombre}</b> · quedan {diasHabiles(hoy, vigente.fin, feriados)} de {diasHabiles(vigente.inicio, vigente.fin, feriados)} días hábiles
                  </p>
                ) : (
                  <p className="mb-3 text-xs text-slate-500">{g.id ? 'Sin ciclo vigente: usa el general o, si no hay, el mes calendario.' : 'Sin ciclo vigente: los equipos sin ciclo propio miden por mes.'}</p>
                )}
                {lista.length === 0 ? (
                  <Vacio icono={CalendarRange} titulo="Sin ciclos" texto={esAdmin ? 'Toca «Primer ciclo» para crearlo.' : undefined} />
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {lista.slice(0, 8).map((c) => {
                      const e = estadoCiclo(c, hoy);
                      return (
                        <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{c.nombre}</p>
                            <p className="text-xs text-slate-500">{fechaBreve(c.inicio)} – {fechaBreve(c.fin)} {c.fin.slice(0, 4)} · {diasHabiles(c.inicio, c.fin, feriados)} días hábiles · {Math.round((diasEntre(c.inicio, c.fin) + 1) / 7)} semanas</p>
                          </div>
                          <Etiqueta tono={ESTADO[e].tono} punto>{ESTADO[e].texto}</Etiqueta>
                          {esAdmin && e !== 'cerrado' && <Boton tamano="sm" variante="fantasma" icono={Pencil} aria-label={`Editar ${c.nombre}`} onClick={() => setEdicion({ id: c.id, equipo_id: c.equipo_id, nombre: c.nombre, inicio: c.inicio, fin: c.fin, notas: c.notas })} />}
                          {esAdmin && e === 'planificado' && <Boton tamano="sm" variante="fantasma" icono={Trash2} aria-label={`Eliminar ${c.nombre}`} onClick={() => void eliminar(c)} />}
                          {esAdmin && e === 'terminado' && <Boton tamano="sm" icono={Lock} onClick={() => void cerrar(c)}>Cerrar</Boton>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Tarjeta>
            );
          })}
        </div>
      ) : (
        <Feriados feriados={feriados} esAdmin={esAdmin} mostrar={mostrar} confirmar={confirmar} />
      )}

      {edicion && (
        <CicloForm
          inicial={edicion}
          equipos={equipos}
          ciclos={ciclos}
          feriados={feriados}
          onCerrar={() => setEdicion(null)}
          onGuardado={(nombre) => { setEdicion(null); mostrar({ tipo: 'ok', texto: `${nombre} guardado.` }); void sincronizarYa(); }}
        />
      )}
    </div>
  );
}

function CicloForm({ inicial, equipos, ciclos, feriados, onCerrar, onGuardado }: {
  inicial: Borrador;
  equipos: Equipo[];
  ciclos: LocalCiclo[];
  feriados: LocalFeriado[];
  onCerrar: () => void;
  onGuardado: (nombre: string) => void;
}) {
  const [c, setC] = useState<Borrador>(inicial);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const problemas = useMemo(() => problemasCiclo(c, ciclos, feriados), [c, ciclos, feriados]);
  const huecos = useMemo(() => (problemas.length ? [] : huecosCiclo(c, ciclos, feriados)), [problemas, c, ciclos, feriados]);
  const habiles = c.inicio && c.fin && c.fin >= c.inicio ? diasHabiles(c.inicio, c.fin, feriados) : 0;
  const feriadosDentro = c.inicio && c.fin ? feriados.filter((f) => f.alcance === 'nacional' && f.fecha >= c.inicio && f.fecha <= c.fin) : [];

  const guardar = async () => {
    const sb = getSupabaseClient();
    if (!sb || problemas.length) return;
    setGuardando(true);
    setError('');
    const fila = { equipo_id: c.equipo_id, nombre: c.nombre.trim(), inicio: c.inicio, fin: c.fin, notas: c.notas?.trim() || null };
    const { data, error: err } = c.id
      ? await sb.from('ciclos').update(fila).eq('id', c.id).select(COLUMNAS_CICLO).single()
      : await sb.from('ciclos').insert(fila).select(COLUMNAS_CICLO).single();
    setGuardando(false);
    if (err) return setError(err.message);
    if (data) {
      const g = data as LocalCiclo;
      await obtenerDb().ciclos.put({ ...g, equipo_nombre: equipos.find((e) => e.id === g.equipo_id)?.nombre ?? null });
    }
    onGuardado(fila.nombre);
  };

  return (
    <Sheet abierto titulo={c.id ? 'Editar ciclo' : 'Nuevo ciclo'} onCerrar={onCerrar}>
      <div className="flex flex-col gap-3">
        <Campo rotulo="Equipo">
          <select value={c.equipo_id ?? ''} onChange={(e) => setC({ ...c, equipo_id: e.target.value || null })} className={estiloInput}>
            {equipos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            <option value="">General (equipos sin ciclo propio)</option>
          </select>
        </Campo>
        <Campo rotulo="Nombre"><input value={c.nombre} onChange={(e) => setC({ ...c, nombre: e.target.value })} placeholder="Ej.: C10-2026" className={estiloInput} /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Empieza"><input type="date" value={c.inicio} onChange={(e) => setC({ ...c, inicio: e.target.value })} className={estiloInput} /></Campo>
          <Campo rotulo="Termina"><input type="date" value={c.fin} min={c.inicio} onChange={(e) => setC({ ...c, fin: e.target.value })} className={estiloInput} /></Campo>
        </div>
        <div className="flex flex-wrap gap-2">
          {[['2 semanas', 11], ['4 semanas', 25], ['5 semanas', 32]].map(([t, n]) => (
            <button key={t} type="button" disabled={!c.inicio} onClick={() => setC({ ...c, fin: diaHabilCercano(fechaTexto(new Date(new Date(`${c.inicio}T12:00:00`).getTime() + (n as number) * 86_400_000)), feriados, -1) })} className="min-h-9 rounded-full border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              {t}
            </button>
          ))}
        </div>
        {habiles > 0 && (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
            <b>{habiles} días hábiles</b> · {Math.round((diasEntre(c.inicio, c.fin) + 1) / 7)} semanas
            {feriadosDentro.length > 0 && <span className="block text-xs text-slate-500">Feriados dentro: {feriadosDentro.map((f) => `${fechaBreve(f.fecha)} (${f.nombre})`).join(', ')}</span>}
          </p>
        )}
        {problemas.length > 0 && (
          <div role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {problemas.map((p) => <p key={p}>{p}</p>)}
            {problemas.some((p) => p.includes('día hábil')) && (
              <button type="button" onClick={() => setC({ ...c, inicio: diaHabilCercano(c.inicio, feriados, 1), fin: diaHabilCercano(c.fin, feriados, -1) })} className="mt-1 text-xs font-semibold text-marca-700 underline dark:text-marca-300">
                Ajustar a días hábiles
              </button>
            )}
          </div>
        )}
        {huecos.length > 0 && (
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
            {huecos.map((h) => <p key={h}>{h}</p>)}
            <p className="text-xs text-slate-500">Puedes guardarlo igual: esos días se miden con el ciclo general o con el mes.</p>
          </div>
        )}
        <Campo rotulo="Nota (opcional)"><input value={c.notas ?? ''} onChange={(e) => setC({ ...c, notas: e.target.value })} className={estiloInput} /></Campo>
        {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="primario" disabled={guardando || problemas.length > 0} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar ciclo'}</Boton>
        </div>
      </div>
    </Sheet>
  );
}

function Feriados({ feriados, esAdmin, mostrar, confirmar }: {
  feriados: LocalFeriado[];
  esAdmin: boolean;
  mostrar: (a: { tipo: 'ok' | 'error'; texto: string }) => void;
  confirmar: (titulo: string, texto: string, o?: { accion?: string; peligro?: boolean }) => Promise<boolean>;
}) {
  const esteAnio = new Date().getFullYear();
  const [anio, setAnio] = useState(esteAnio);
  const [nuevo, setNuevo] = useState<{ fecha: string; nombre: string; alcance: 'nacional' | 'regional'; estados: string[] } | null>(null);
  const [sugeridos, setSugeridos] = useState<{ fecha: string; nombre: string; marcado: boolean }[] | null>(null);
  const delAnio = feriados.filter((f) => f.fecha.startsWith(String(anio))).sort((a, b) => a.fecha.localeCompare(b.fecha));

  const guardarNuevo = async () => {
    const sb = getSupabaseClient();
    if (!sb || !nuevo) return;
    if (!nuevo.fecha || !nuevo.nombre.trim()) return mostrar({ tipo: 'error', texto: 'Escribe la fecha y el nombre del feriado.' });
    if (nuevo.alcance === 'regional' && nuevo.estados.length === 0) return mostrar({ tipo: 'error', texto: 'Elige al menos un estado para el feriado regional.' });
    const { data, error } = await sb.from('feriados').insert({ fecha: nuevo.fecha, nombre: nuevo.nombre.trim(), alcance: nuevo.alcance, estados: nuevo.alcance === 'regional' ? nuevo.estados : [] }).select(COLUMNAS_FERIADO);
    if (error) return mostrar({ tipo: 'error', texto: /uq_feriado/.test(error.message) ? 'Ya hay un feriado nacional ese día.' : error.message });
    if (data) await obtenerDb().feriados.bulkPut((data as LocalFeriado[]).map(aFeriadoLocal));
    setNuevo(null);
    mostrar({ tipo: 'ok', texto: 'Feriado guardado.' });
    void sincronizarYa();
  };

  const guardarSugeridos = async () => {
    const sb = getSupabaseClient();
    if (!sb || !sugeridos) return;
    const filas = sugeridos.filter((s) => s.marcado).map((s) => ({ fecha: s.fecha, nombre: s.nombre, alcance: 'nacional' }));
    if (filas.length) {
      const { data, error } = await sb.from('feriados').insert(filas).select(COLUMNAS_FERIADO);
      if (error) return mostrar({ tipo: 'error', texto: error.message });
      if (data) await obtenerDb().feriados.bulkPut((data as LocalFeriado[]).map(aFeriadoLocal));
    }
    setSugeridos(null);
    mostrar({ tipo: 'ok', texto: `${filas.length} feriados nacionales de ${anio} agregados.` });
    void sincronizarYa();
  };

  const eliminar = async (f: LocalFeriado) => {
    const sb = getSupabaseClient();
    if (!sb || !(await confirmar(`Quitar ${f.nombre}`, `El ${fechaBreve(f.fecha)} vuelve a ser día hábil.`, { accion: 'Quitar', peligro: true }))) return;
    const { error } = await sb.from('feriados').update({ deleted_at: new Date().toISOString() }).eq('id', f.id);
    if (error) return mostrar({ tipo: 'error', texto: error.message });
    await obtenerDb().feriados.delete(f.id);
    void sincronizarYa();
  };

  return (
    <Tarjeta>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmentado valor={String(anio)} onChange={(v) => setAnio(Number(v))} opciones={[esteAnio, esteAnio + 1].map((a) => ({ id: String(a), texto: String(a) }))} />
        {esAdmin && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Boton icono={Sparkles} onClick={() => setSugeridos(feriadosVenezuela(anio).filter((s) => !feriados.some((f) => f.fecha === s.fecha && f.alcance === 'nacional')).map((s) => ({ ...s, marcado: true })))}>
              Feriados nacionales de {anio}
            </Boton>
            <Boton variante="primario" icono={Plus} onClick={() => setNuevo({ fecha: `${anio}-01-01`, nombre: '', alcance: 'nacional', estados: [] })}>Agregar feriado</Boton>
          </div>
        )}
      </div>
      {delAnio.length === 0 ? (
        <Vacio icono={CalendarRange} titulo={`Sin feriados cargados para ${anio}`} texto={esAdmin ? 'Usa «Feriados nacionales» para agregarlos de una vez y suma los regionales a mano.' : undefined} />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {delAnio.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="w-24 shrink-0 text-sm font-semibold">{fechaBreve(f.fecha)} · {new Date(`${f.fecha}T12:00:00`).toLocaleDateString('es', { weekday: 'short' })}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{f.nombre}</span>
              <Etiqueta tono={f.alcance === 'nacional' ? 'marca' : 'info'}>{f.alcance === 'nacional' ? 'Nacional' : f.estados.join(', ')}</Etiqueta>
              {esAdmin && <Boton tamano="sm" variante="fantasma" icono={Trash2} aria-label={`Quitar ${f.nombre}`} onClick={() => void eliminar(f)} />}
            </li>
          ))}
        </ul>
      )}

      {nuevo && (
        <Sheet abierto titulo="Agregar feriado" onCerrar={() => setNuevo(null)}>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-[10rem_minmax(0,1fr)] gap-3">
              <Campo rotulo="Fecha"><input type="date" value={nuevo.fecha} onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })} className={estiloInput} /></Campo>
              <Campo rotulo="Nombre"><input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Ej.: Virgen de Chiquinquirá" className={estiloInput} /></Campo>
            </div>
            <Grupo rotulo="Alcance">
              <Segmentado valor={nuevo.alcance} onChange={(v) => setNuevo({ ...nuevo, alcance: v })} opciones={[{ id: 'nacional', texto: 'Nacional (todos)' }, { id: 'regional', texto: 'Regional (algunos estados)' }]} />
            </Grupo>
            {nuevo.alcance === 'regional' && (
              <Grupo rotulo="Estados" ayuda="Solo descuenta para quienes trabajan en esos estados (según su zona en Usuarios).">
                <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                  {ESTADOS_VENEZUELA.map((e) => {
                    const sel = nuevo.estados.includes(e);
                    return (
                      <button key={e} type="button" aria-pressed={sel} onClick={() => setNuevo({ ...nuevo, estados: sel ? nuevo.estados.filter((x) => x !== e) : [...nuevo.estados, e] })} className={`min-h-8 rounded-full border px-3 text-xs font-semibold ${sel ? 'border-marca-700 bg-marca-700 text-white' : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'}`}>{e}</button>
                    );
                  })}
                </div>
              </Grupo>
            )}
            <div className="flex justify-end gap-2">
              <Boton onClick={() => setNuevo(null)}>Cancelar</Boton>
              <Boton variante="primario" onClick={() => void guardarNuevo()}>Guardar feriado</Boton>
            </div>
          </div>
        </Sheet>
      )}

      {sugeridos && (
        <Sheet abierto titulo={`Feriados nacionales de ${anio}`} onCerrar={() => setSugeridos(null)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">Los de la ley (incluidos Carnaval y Semana Santa, que cambian cada año). Revisa y desmarca los que no apliquen; los que ya estaban cargados no aparecen.</p>
            {sugeridos.length === 0 ? (
              <p className="text-sm text-slate-500">Ya están todos cargados.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {sugeridos.map((s, i) => (
                  <li key={s.fecha} className="flex items-center gap-3 py-1.5 text-sm">
                    <Casilla etiqueta={`Incluir ${s.nombre}`} marcada={s.marcado} onChange={(v) => setSugeridos(sugeridos.map((x, k) => (k === i ? { ...x, marcado: v } : x)))} />
                    <span className="w-28 font-semibold">{fechaBreve(s.fecha)} · {new Date(`${s.fecha}T12:00:00`).toLocaleDateString('es', { weekday: 'short' })}</span>
                    <span>{s.nombre}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end gap-2">
              <Boton onClick={() => setSugeridos(null)}>Cancelar</Boton>
              <Boton variante="primario" disabled={!sugeridos.some((s) => s.marcado)} onClick={() => void guardarSugeridos()}>Agregar {sugeridos.filter((s) => s.marcado).length}</Boton>
            </div>
          </div>
        </Sheet>
      )}
    </Tarjeta>
  );
}
