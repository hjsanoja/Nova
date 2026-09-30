import { useEffect, useMemo, useState } from 'react';
import { Megaphone, Plus, Search, Trash2, X } from 'lucide-react';
import { Sheet } from '../components/capture/Sheet';
import { BarraSeleccion, Boton, Campo, Grupo, Casilla, Etiqueta, Filtros, PageHeader, Segmentado, Tarjeta, Vacio, estiloInput, useAviso, useConfirmar, useSeleccion } from '../components/ui/kit';
import { obtenerDb } from '../offline/db';
import { sincronizarYa } from '../offline/motor';
import { useLive } from '../offline/useLive';
import type { LocalComunicado, TipoComunicado } from '../offline/types';
import { getSupabaseClient } from '../services/supabaseClient';
import { estiloComunicado } from './BannerComunicados';
import { ROLES, TIPOS, describirDestino, tipo, vigencia } from './logica';
import type { EstadoVigencia } from './logica';

interface Zonas { estados: string[]; ciudades: string[]; regiones: string[]; equipos: { id: string; nombre: string }[] }
const SIN_ZONAS: Zonas = { estados: [], ciudades: [], regiones: [], equipos: [] };

function useZonas(): Zonas {
  const [z, setZ] = useState<Zonas>(SIN_ZONAS);
  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;
    void sb.rpc('zonas_disponibles').then(({ data }) => data && setZ({ ...SIN_ZONAS, ...(data as Partial<Zonas>) }));
  }, []);
  return z;
}

type Borrador = Omit<LocalComunicado, 'para_mi' | 'creado_por' | 'created_at' | 'updated_at'>;
const aLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const nuevo = (): Borrador => ({ id: crypto.randomUUID(), titulo: '', mensaje: '', tipo: 'anuncio', roles: [], equipos: [], estados: [], ciudades: [], regiones: [], vigente_desde: new Date().toISOString(), vigente_hasta: null });
const ETIQUETA_VIGENCIA: Record<EstadoVigencia, { texto: string; tono: 'exito' | 'neutro' | 'aviso' }> = {
  activo: { texto: 'Activo', tono: 'exito' },
  programado: { texto: 'Programado', tono: 'aviso' },
  vencido: { texto: 'Vencido', tono: 'neutro' },
};

/** Comunicados de la gerencia: anuncios, descuentos, estrategias o alertas para todos o por rol, equipo, estado, ciudad o región. */
export function ComunicadosVista() {
  const db = obtenerDb();
  const lista = useLive(() => db.comunicados.toArray(), [], [] as LocalComunicado[]);
  const zonas = useZonas();
  const [filtro, setFiltro] = useState<'todos' | EstadoVigencia>('activo');
  const [edicion, setEdicion] = useState<Borrador | null>(null);
  const sel = useSeleccion();
  const { mostrar, nodo } = useAviso();
  const { confirmar, nodo: nodoConfirmar } = useConfirmar();
  const nombreEquipo = (id: string) => zonas.equipos.find((e) => e.id === id)?.nombre ?? 'Equipo';

  const filas = useMemo(
    () => [...lista].filter((c) => filtro === 'todos' || vigencia(c) === filtro).sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde)),
    [lista, filtro]
  );

  const eliminar = async (ids: string[]) => {
    const sb = getSupabaseClient();
    if (!sb || !(await confirmar(`Eliminar ${ids.length} comunicado${ids.length === 1 ? '' : 's'}`, 'Dejarán de verse en todos los dispositivos.', { accion: 'Eliminar', peligro: true }))) return;
    const { error } = await sb.from('comunicados').update({ deleted_at: new Date().toISOString() }).in('id', ids);
    if (error) return mostrar({ tipo: 'error', texto: error.message });
    sel.limpiar();
    await sincronizarYa();
    mostrar({ tipo: 'ok', texto: 'Comunicados eliminados.' });
  };

  return (
    <div>
      <PageHeader
        titulo="Comunicados"
        descripcion="Anuncios, descuentos y estrategias que aparecen arriba en la app de cada persona."
        acciones={<Boton variante="primario" icono={Plus} onClick={() => setEdicion(nuevo())}>Nuevo comunicado</Boton>}
      />
      {nodo}
      {nodoConfirmar}
      <div className="mb-3">
        <Filtros valor={filtro} onChange={setFiltro} opciones={[{ id: 'activo', texto: 'Activos' }, { id: 'programado', texto: 'Programados' }, { id: 'vencido', texto: 'Vencidos' }, { id: 'todos', texto: 'Todos' }]} />
      </div>
      <BarraSeleccion cantidad={sel.cantidad} onLimpiar={sel.limpiar}>
        <Boton tamano="sm" variante="peligro" icono={Trash2} onClick={() => void eliminar([...sel.ids])}>Eliminar</Boton>
      </BarraSeleccion>
      {filas.length === 0 ? (
        <Tarjeta><Vacio icono={Megaphone} titulo="No hay comunicados" texto="Crea uno para avisar a todo el equipo o solo a una zona." accion={<Boton variante="primario" icono={Plus} onClick={() => setEdicion(nuevo())}>Nuevo comunicado</Boton>} /></Tarjeta>
      ) : (
        <ul className="flex flex-col gap-2">
          {filas.map((c) => {
            const v = ETIQUETA_VIGENCIA[vigencia(c)];
            const t = tipo(c.tipo);
            return (
              <li key={c.id} className="flex items-start gap-1 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
                <Casilla etiqueta={`Seleccionar ${c.titulo}`} marcada={sel.tiene(c.id)} onChange={() => sel.alternar(c.id)} />
                <button type="button" onClick={() => setEdicion({ ...c })} className="min-w-0 flex-1 py-1.5 text-left">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900 dark:text-white">{c.titulo}</span>
                    <Etiqueta tono={t.tono}>{t.texto}</Etiqueta>
                    <Etiqueta tono={v.tono}>{v.texto}</Etiqueta>
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-slate-600 dark:text-slate-300">{c.mensaje}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Para: {describirDestino(c, nombreEquipo)} · desde {new Date(c.vigente_desde).toLocaleDateString('es')}{c.vigente_hasta ? ` hasta ${new Date(c.vigente_hasta).toLocaleDateString('es')}` : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {edicion && (
        <FormComunicado
          inicial={edicion}
          zonas={zonas}
          nueva={!lista.some((c) => c.id === edicion.id)}
          onCerrar={() => setEdicion(null)}
          onGuardado={async (titulo) => {
            setEdicion(null);
            await sincronizarYa();
            mostrar({ tipo: 'ok', texto: `"${titulo}" publicado.` });
          }}
        />
      )}
    </div>
  );
}

/** Elección múltiple con chips; con muchas opciones se busca. `libre` permite escribir valores nuevos. */
function Chips({ opciones, valor, onChange, libre = false, placeholder }: { opciones: { id: string; texto: string }[]; valor: string[]; onChange: (v: string[]) => void; libre?: boolean; placeholder: string }) {
  const [q, setQ] = useState('');
  const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const visibles = opciones.filter((o) => !valor.includes(o.id) && (!q || norm(o.texto).includes(norm(q)))).slice(0, 12);
  const agregar = (id: string) => { onChange([...valor, id]); setQ(''); };
  const texto = (id: string) => opciones.find((o) => o.id === id)?.texto ?? id;
  return (
    <div className="flex flex-col gap-2">
      {valor.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {valor.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-marca-50 py-0.5 pl-2.5 pr-1 text-sm text-marca-900 dark:bg-marca-950 dark:text-marca-100">
              {texto(v)}
              <button type="button" aria-label={`Quitar ${texto(v)}`} onClick={() => onChange(valor.filter((x) => x !== v))} className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-marca-100 dark:hover:bg-marca-900"><X className="h-3.5 w-3.5" /></button>
            </span>
          ))}
        </div>
      )}
      {(opciones.length > 8 || libre) && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && libre && q.trim()) { e.preventDefault(); agregar(q.trim()); } }}
            placeholder={placeholder}
            aria-label={placeholder}
            className={`${estiloInput} pl-9`}
          />
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {visibles.map((o) => (
          <button key={o.id} type="button" onClick={() => agregar(o.id)} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-slate-300 px-2.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            <Plus className="h-3.5 w-3.5" aria-hidden /> {o.texto}
          </button>
        ))}
        {libre && q.trim() && !opciones.some((o) => norm(o.texto) === norm(q)) && (
          <button type="button" onClick={() => agregar(q.trim())} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-dashed border-slate-400 px-2.5 text-sm text-slate-700 dark:text-slate-200">
            <Plus className="h-3.5 w-3.5" aria-hidden /> Agregar “{q.trim()}”
          </button>
        )}
      </div>
    </div>
  );
}

function FormComunicado({ inicial, zonas, nueva, onCerrar, onGuardado }: { inicial: Borrador; zonas: Zonas; nueva: boolean; onCerrar: () => void; onGuardado: (titulo: string) => void }) {
  const [c, setC] = useState<Borrador>(inicial);
  const [desde, setDesde] = useState(aLocal(new Date(inicial.vigente_desde)));
  const [hasta, setHasta] = useState(inicial.vigente_hasta ? inicial.vigente_hasta.slice(0, 10) : '');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const e = estiloComunicado(c.tipo);
  const Icono = e.icono;
  const cambiar = (p: Partial<Borrador>) => setC({ ...c, ...p });
  const nombreEquipo = (id: string) => zonas.equipos.find((x) => x.id === id)?.nombre ?? 'Equipo';

  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const sb = getSupabaseClient();
    if (!sb) return;
    if (!c.titulo.trim()) return setError('Escribe un título.');
    setGuardando(true);
    setError('');
    const fila = {
      id: c.id, titulo: c.titulo.trim(), mensaje: c.mensaje.trim(), tipo: c.tipo, roles: c.roles, equipos: c.equipos, estados: c.estados,
      ciudades: c.ciudades, regiones: c.regiones, vigente_desde: new Date(desde).toISOString(),
      vigente_hasta: hasta ? new Date(`${hasta}T23:59:59`).toISOString() : null, deleted_at: null,
    };
    const { error: err } = await sb.from('comunicados').upsert(fila);
    setGuardando(false);
    if (err) return setError(err.message);
    onGuardado(fila.titulo);
  };

  return (
    <Sheet abierto titulo={nueva ? 'Nuevo comunicado' : 'Editar comunicado'} onCerrar={onCerrar} ancho="md:max-w-2xl">
      <form onSubmit={guardar} className="flex flex-col gap-4">
        <Grupo rotulo="Tipo">
          <Segmentado valor={c.tipo} onChange={(v) => cambiar({ tipo: v as TipoComunicado })} opciones={TIPOS.map((t) => ({ id: t.id, texto: t.texto }))} />
        </Grupo>
        <Campo rotulo="Título"><input value={c.titulo} onChange={(ev) => cambiar({ titulo: ev.target.value })} maxLength={120} className={estiloInput} placeholder="Ej.: 15% en analgésicos esta semana" /></Campo>
        <Campo rotulo="Mensaje"><textarea value={c.mensaje} onChange={(ev) => cambiar({ mensaje: ev.target.value })} rows={4} maxLength={1500} className={`${estiloInput} py-2`} /></Campo>

        <fieldset className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <legend className="px-1 text-sm font-semibold text-slate-900 dark:text-white">¿Para quién?</legend>
          <p className="text-xs text-slate-500">Sin elegir nada, llega a todos. Si eliges varios criterios, llega a quien cumpla todos. Estado y ciudad también cuentan por las farmacias del fichero de cada vendedor.</p>
          <Grupo rotulo="Roles"><Chips opciones={ROLES} valor={c.roles} onChange={(v) => cambiar({ roles: v })} placeholder="Buscar rol" /></Grupo>
          {zonas.equipos.length > 0 && <Grupo rotulo="Equipos"><Chips opciones={zonas.equipos.map((x) => ({ id: x.id, texto: x.nombre }))} valor={c.equipos} onChange={(v) => cambiar({ equipos: v })} placeholder="Buscar equipo" /></Grupo>}
          <Grupo rotulo="Estados"><Chips opciones={zonas.estados.map((x) => ({ id: x, texto: x }))} valor={c.estados} onChange={(v) => cambiar({ estados: v })} libre placeholder="Buscar o escribir un estado" /></Grupo>
          <Grupo rotulo="Ciudades o municipios"><Chips opciones={zonas.ciudades.map((x) => ({ id: x, texto: x }))} valor={c.ciudades} onChange={(v) => cambiar({ ciudades: v })} libre placeholder="Buscar o escribir una ciudad" /></Grupo>
          <Grupo rotulo="Regiones" ayuda="La región de cada persona se asigna en Configuración → Usuarios."><Chips opciones={zonas.regiones.map((x) => ({ id: x, texto: x }))} valor={c.regiones} onChange={(v) => cambiar({ regiones: v })} libre placeholder="Buscar o escribir una región" /></Grupo>
          <p className="text-sm text-slate-700 dark:text-slate-200">Llegará a: <b>{describirDestino(c, nombreEquipo)}</b></p>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Visible desde"><input type="datetime-local" value={desde} onChange={(ev) => setDesde(ev.target.value)} className={estiloInput} /></Campo>
          <Campo rotulo="Hasta (opcional)"><input type="date" value={hasta} onChange={(ev) => setHasta(ev.target.value)} className={estiloInput} /></Campo>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">Así se verá</p>
          <div className={`flex gap-3 rounded-xl border p-3 ${e.caja}`}>
            <Icono className={`mt-0.5 h-5 w-5 shrink-0 ${e.icono_c}`} aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{c.titulo || 'Título del comunicado'}</p>
              <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">{c.mensaje || 'Mensaje'}</p>
            </div>
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton type="submit" variante="primario" icono={Megaphone} disabled={guardando}>{guardando ? 'Publicando…' : nueva ? 'Publicar' : 'Guardar cambios'}</Boton>
        </div>
      </form>
    </Sheet>
  );
}
