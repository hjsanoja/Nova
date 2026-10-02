import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Percent, Plus, Table2, Target, Trash2, X } from 'lucide-react';
import { Sheet } from '../components/capture/Sheet';
import { Medidor } from '../components/graficos/Graficos';
import { BarraSeleccion, Boton, Campo, Casilla, Etiqueta, Grupo, PageHeader, Pildoras, Tarjeta, Vacio, estiloInput, useAviso, useConfirmar, useSeleccion } from '../components/ui/kit';
import { obtenerDb } from '../offline/db';
import { sincronizarYa } from '../offline/motor';
import { useLive } from '../offline/useLive';
import type { IndicadorMeta, LocalCiclo, LocalMeta } from '../offline/types';
import { SelectorCliente } from '../pedido/SelectorCliente';
import { getSupabaseClient } from '../services/supabaseClient';
import type { Usuario } from '../types/pharmacy';
import { unidadesPorPedido } from '../vistas/indicadores';
import { useClientes, useDetalles, useDroguerias, usePedidos, useProductos, useUsuariosNube } from '../vistas/useDatos';
import { INDICADORES, NIVELES_META, avanceMeta, describirMeta, indicador, mesSiguiente, pedidosDeMeta, periodoDe } from './logica';
import type { ContextoMetas } from './logica';
import { DetallePedidos } from '../vistas/DetallePedidos';
import type { SolicitudDetalle } from '../vistas/DetallePedidos';
import { detallesPorPedido } from '../vistas/logica';
import { useMedicos, useVisitas } from '../crm/datos';
import { useCiclos, useEquipos, useFeriados } from '../ciclos/datos';
import { ciclosDe, diasHabiles, estadoCiclo, fechaBreve, fechaTexto } from '../ciclos/logica';

const formato = (n: number) => n.toLocaleString('es-VE');
const nombreMes = (periodo: string) => {
  const [a, m] = periodo.split('-').map(Number);
  const t = new Date(a, m - 1, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

type Borrador = Omit<LocalMeta, 'updated_at'>;

/**
 * Trae de la nube las metas de un ciclo o de un mes y las deja en el dispositivo: lo guardado se ve al instante, sin
 * esperar la descarga completa (que igual corre después).
 */
async function refrescarMetas(donde: { ciclo_id: string } | { periodo: string }): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) return;
  const q = sb.from('metas').select('id,periodo,ciclo_id,vendedor_id,cliente_id,drogueria_id,medico_id,indicador,objetivo,updated_at').is('deleted_at', null);
  const { data, error } = 'ciclo_id' in donde ? await q.eq('ciclo_id', donde.ciclo_id) : await q.eq('periodo', donde.periodo);
  if (error || !data) return;
  const db = obtenerDb();
  await db.transaction('rw', db.metas, async () => {
    const actuales = 'ciclo_id' in donde ? await db.metas.where('ciclo_id').equals(donde.ciclo_id).primaryKeys() : await db.metas.where('periodo').equals(donde.periodo).primaryKeys();
    await db.metas.bulkDelete(actuales);
    await db.metas.bulkPut((data as LocalMeta[]).map((m) => ({ ...m, objetivo: Number(m.objetivo) })));
  });
}
type Modo = 'ciclo' | 'mes';
interface Resultado { meta_id: string; valor: number; objetivo: number; pct: number }

/**
 * Metas por ciclo (de cada equipo) o por mes: unidades, pedidos, farmacias con pedido, visitas a médicos y farmacias y
 * médicos visitados, por representante, farmacia, médico o droguería. Se llenan rápido en una tabla, se copian de otro
 * ciclo y se ajustan en %. Al cerrar un ciclo queda la foto de sus resultados.
 */
export function MetasVista({ usuario }: { usuario?: Usuario }) {
  const db = obtenerDb();
  const ciclos = useCiclos();
  const feriados = useFeriados();
  const equipos = useEquipos(ciclos);
  const hoy = fechaTexto(new Date());
  const [modo, setModo] = useState<Modo | null>(null);
  const modoActivo: Modo = modo ?? (ciclos.length ? 'ciclo' : 'mes');
  const [equipo, setEquipo] = useState<string | null | undefined>(undefined);
  const equipoActivo = equipo !== undefined ? equipo : usuario?.equipo_id && equipos.some((e) => e.id === usuario.equipo_id) ? usuario.equipo_id : equipos[0]?.id ?? null;
  const delEquipo = useMemo(() => ciclosDe(ciclos, equipoActivo ?? null), [ciclos, equipoActivo]);
  const [cicloId, setCicloId] = useState<string | null>(null);
  const ciclo = delEquipo.find((c) => c.id === cicloId) ?? delEquipo.find((c) => estadoCiclo(c, hoy) === 'vigente') ?? [...delEquipo].reverse().find((c) => c.inicio > hoy) ?? delEquipo[0];
  const [periodo, setPeriodo] = useState(() => periodoDe(new Date()));

  const metas = useLive(
    () => (modoActivo === 'ciclo' ? (ciclo ? db.metas.where('ciclo_id').equals(ciclo.id).toArray() : []) : db.metas.where('periodo').equals(periodo).toArray()),
    [modoActivo, ciclo?.id, periodo],
    [] as LocalMeta[]
  );
  const anteriores = useLive(() => db.metas.where('periodo').equals(mesSiguiente(periodo, -1)).toArray(), [periodo], [] as LocalMeta[]);
  const cicloAnterior = ciclo ? delEquipo.find((c) => c.fin < ciclo.inicio) : undefined;
  const metasCicloAnterior = useLive(() => (cicloAnterior ? db.metas.where('ciclo_id').equals(cicloAnterior.id).count() : 0), [cicloAnterior?.id], 0);

  const pedidos = usePedidos();
  const detalles = useDetalles();
  const clientes = useClientes();
  const droguerias = useDroguerias();
  const medicos = useMedicos();
  const visitas = useVisitas();
  const { usuarios } = useUsuariosNube();
  const unidades = useMemo(() => unidadesPorPedido(detalles), [detalles]);
  const porPedido = useMemo(() => detallesPorPedido(detalles), [detalles]);
  const productos = useProductos();
  const [detalle, setDetalle] = useState<SolicitudDetalle | null>(null);
  const [edicion, setEdicion] = useState<Borrador | null>(null);
  const [tabla, setTabla] = useState(false);
  const [copiando, setCopiando] = useState(false);
  const [ajustando, setAjustando] = useState(false);
  const sel = useSeleccion();
  const { mostrar, nodo } = useAviso();
  const { confirmar, nodo: nodoConfirmar } = useConfirmar();
  const resultados = useResultados(ciclo?.cerrado_en ? ciclo.id : null);

  const nombres = useMemo(() => {
    const u = new Map(usuarios.map((x) => [x.id, x.nombre_completo]));
    const c = new Map(clientes.map((x) => [x.id, x.nombre_comercial]));
    const d = new Map(droguerias.map((x) => [x.id, x.nombre]));
    const m = new Map(medicos.map((x) => [x.id, x.nombre]));
    return { vendedor: (id: string) => u.get(id) ?? 'Representante', cliente: (id: string) => c.get(id) ?? 'Farmacia', drogueria: (id: string) => d.get(id) ?? 'Droguería', medico: (id: string) => m.get(id) ?? 'Médico' };
  }, [usuarios, clientes, droguerias, medicos]);
  const nombresDetalle = useMemo(() => {
    const p = new Map(productos.map((x) => [x.id, x.nombre_comercial]));
    return { ...nombres, producto: (id: string) => p.get(id) ?? 'Producto' };
  }, [nombres, productos]);
  const equipoDe = useMemo(() => {
    const m = new Map(usuarios.map((u) => [u.id, u.equipo_id ?? null]));
    return (id: string) => m.get(id);
  }, [usuarios]);
  const ctx: ContextoMetas = { pedidos, unidades, visitas, ciclos, feriados, equipoDe };

  const filas = useMemo(
    () =>
      metas
        .map((m) => ({ m, a: avanceMeta(m, ctx), texto: describirMeta(m, nombres, ciclo) }))
        .sort((x, y) => NIVELES_META[x.a.nivel].orden - NIVELES_META[y.a.nivel].orden || x.texto.localeCompare(y.texto)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [metas, pedidos, unidades, visitas, ciclos, feriados, nombres, ciclo, equipoDe]
  );

  const refrescarVista = () => refrescarMetas(modoActivo === 'ciclo' && ciclo ? { ciclo_id: ciclo.id } : { periodo });

  const eliminar = async (ids: string[]) => {
    const sb = getSupabaseClient();
    if (!sb || !(await confirmar(`Eliminar ${ids.length} meta${ids.length === 1 ? '' : 's'}`, 'Los pedidos y visitas no cambian; solo deja de medirse el avance.', { accion: 'Eliminar', peligro: true }))) return;
    const { error } = await sb.from('metas').update({ deleted_at: new Date().toISOString() }).in('id', ids);
    if (error) return mostrar({ tipo: 'error', texto: error.message });
    sel.limpiar();
    await refrescarVista();
    void sincronizarYa();
  };

  const copiarMesAnterior = async () => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const nuevas = anteriores.map((m) => ({ periodo, vendedor_id: m.vendedor_id, cliente_id: m.cliente_id, drogueria_id: m.drogueria_id, indicador: m.indicador, objetivo: m.objetivo }));
    const { error } = await sb.from('metas').insert(nuevas);
    if (error) return mostrar({ tipo: 'error', texto: error.message });
    await refrescarMetas({ periodo });
    void sincronizarYa();
    mostrar({ tipo: 'ok', texto: `${nuevas.length} metas copiadas de ${nombreMes(mesSiguiente(periodo, -1))}.` });
  };

  const copiarCiclo = async (origen: string, factor: number, reemplazar: boolean) => {
    const sb = getSupabaseClient();
    if (!sb || !ciclo) return;
    const { data, error } = await sb.rpc('copiar_metas_ciclo', { p_origen: origen, p_destino: ciclo.id, p_factor: factor, p_reemplazar: reemplazar });
    if (error) return mostrar({ tipo: 'error', texto: error.message });
    setCopiando(false);
    await refrescarMetas({ ciclo_id: ciclo.id });
    void sincronizarYa();
    mostrar({ tipo: 'ok', texto: data ? `${data} metas copiadas a ${ciclo.nombre}.` : 'No había metas nuevas para copiar (las iguales no se duplican).' });
  };

  const ajustar = async (factor: number) => {
    const sb = getSupabaseClient();
    if (!sb || !ciclo) return;
    const { data, error } = await sb.rpc('ajustar_metas_ciclo', { p_ciclo: ciclo.id, p_factor: factor });
    if (error) return mostrar({ tipo: 'error', texto: error.message });
    setAjustando(false);
    await refrescarMetas({ ciclo_id: ciclo.id });
    void sincronizarYa();
    mostrar({ tipo: 'ok', texto: `${data} metas ajustadas ${factor >= 1 ? '+' : ''}${Math.round((factor - 1) * 100)}%.` });
  };

  const nueva = (): Borrador => ({ id: crypto.randomUUID(), periodo: modoActivo === 'mes' ? periodo : null, ciclo_id: modoActivo === 'ciclo' ? ciclo?.id ?? null : null, vendedor_id: null, cliente_id: null, drogueria_id: null, medico_id: null, indicador: 'unidades', objetivo: 0 });
  const titulo = modoActivo === 'ciclo' ? ciclo?.nombre ?? 'Sin ciclos' : nombreMes(periodo);
  const cerrado = !!ciclo?.cerrado_en && modoActivo === 'ciclo';
  const puedeAgregar = modoActivo === 'mes' || (!!ciclo && !cerrado);

  return (
    <div>
      <PageHeader
        titulo="Metas"
        descripcion="Objetivos por ciclo (o por mes): por representante, farmacia, médico o droguería. La marca en la barra es lo esperado a hoy; si una meta va en riesgo, NOVA avisa al representante y a la gerencia."
        acciones={puedeAgregar ? (
          <>
            {modoActivo === 'ciclo' && <Boton icono={Table2} onClick={() => setTabla(true)}>Tabla de metas</Boton>}
            <Boton variante="primario" icono={Plus} onClick={() => setEdicion(nueva())}>Nueva meta</Boton>
          </>
        ) : undefined}
      />
      {nodo}
      {nodoConfirmar}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Pildoras valor={modoActivo} onChange={(v) => { setModo(v); sel.limpiar(); }} etiqueta="Medir por" opciones={[{ id: 'ciclo', texto: 'Por ciclo' }, { id: 'mes', texto: 'Por mes' }]} />
        {modoActivo === 'ciclo' ? (
          <>
            <select value={equipoActivo ?? ''} onChange={(e) => { setEquipo(e.target.value || null); setCicloId(null); }} aria-label="Equipo" className={`${estiloInput} w-auto`}>
              {equipos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              <option value="">General</option>
            </select>
            <select value={ciclo?.id ?? ''} onChange={(e) => setCicloId(e.target.value)} aria-label="Ciclo" className={`${estiloInput} w-auto`} disabled={delEquipo.length === 0}>
              {delEquipo.length === 0 && <option value="">Sin ciclos</option>}
              {delEquipo.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {fechaBreve(c.inicio)} – {fechaBreve(c.fin)}</option>)}
            </select>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Boton tamano="sm" variante="fantasma" icono={ChevronLeft} aria-label="Mes anterior" onClick={() => setPeriodo(mesSiguiente(periodo, -1))} />
            <p className="min-w-40 text-center text-sm font-semibold text-slate-900 dark:text-white">{nombreMes(periodo)}</p>
            <Boton tamano="sm" variante="fantasma" icono={ChevronRight} aria-label="Mes siguiente" onClick={() => setPeriodo(mesSiguiente(periodo))} />
          </div>
        )}
      </div>

      {modoActivo === 'ciclo' && ciclo && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <Etiqueta tono={estadoCiclo(ciclo, hoy) === 'vigente' ? 'exito' : estadoCiclo(ciclo, hoy) === 'planificado' ? 'marca' : 'neutro'} punto>
            {{ vigente: 'Vigente', planificado: 'Próximo', terminado: 'Terminado', cerrado: 'Cerrado' }[estadoCiclo(ciclo, hoy)]}
          </Etiqueta>
          <span className="text-slate-600 dark:text-slate-300">
            {diasHabiles(ciclo.inicio, ciclo.fin, feriados)} días hábiles
            {estadoCiclo(ciclo, hoy) === 'vigente' ? ` · quedan ${diasHabiles(hoy, ciclo.fin, feriados)}` : ''}
            {cerrado ? ' · resultados guardados al cierre' : ''}
          </span>
          {!cerrado && metas.length > 0 && (
            <div className="ml-auto flex flex-wrap gap-2">
              <Boton tamano="sm" icono={Copy} onClick={() => setCopiando(true)}>Copiar de otro ciclo</Boton>
              <Boton tamano="sm" icono={Percent} onClick={() => setAjustando(true)}>Ajustar %</Boton>
            </div>
          )}
        </div>
      )}

      <BarraSeleccion cantidad={sel.cantidad} onLimpiar={sel.limpiar}>
        <Boton tamano="sm" variante="peligro" icono={Trash2} onClick={() => void eliminar([...sel.ids])}>Eliminar</Boton>
      </BarraSeleccion>

      {modoActivo === 'ciclo' && !ciclo ? (
        <Tarjeta><Vacio icono={Target} titulo="Este equipo aún no tiene ciclos" texto="La administración los crea en el módulo Ciclos. Mientras tanto puedes medir por mes." /></Tarjeta>
      ) : filas.length === 0 ? (
        <Tarjeta>
          <Vacio
            icono={Target}
            titulo={`Sin metas para ${modoActivo === 'ciclo' ? titulo : titulo.toLowerCase()}`}
            texto={modoActivo === 'ciclo' ? 'Llénalas de corrido en la tabla, copia las de otro ciclo o crea una por una.' : 'Crea una meta de unidades, pedidos o farmacias con pedido.'}
            accion={puedeAgregar ? (
              <div className="flex flex-wrap justify-center gap-2">
                {modoActivo === 'ciclo' ? (
                  <>
                    <Boton variante="primario" icono={Table2} onClick={() => setTabla(true)}>Tabla de metas</Boton>
                    {cicloAnterior && metasCicloAnterior > 0 && <Boton icono={Copy} onClick={() => void copiarCiclo(cicloAnterior.id, 1, false)}>Repetir las {metasCicloAnterior} de {cicloAnterior.nombre}</Boton>}
                    <Boton icono={Copy} onClick={() => setCopiando(true)}>Copiar de otro ciclo</Boton>
                  </>
                ) : (
                  <>
                    <Boton variante="primario" icono={Plus} onClick={() => setEdicion(nueva())}>Nueva meta</Boton>
                    {anteriores.length > 0 && <Boton icono={Copy} onClick={() => void copiarMesAnterior()}>Copiar las {anteriores.length} del mes anterior</Boton>}
                  </>
                )}
              </div>
            ) : undefined}
          />
        </Tarjeta>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filas.map(({ m, a, texto }) => {
            const ind = indicador(m.indicador);
            const r = resultados?.get(m.id);
            const valor = r ? r.valor : a.valor;
            const nivel = NIVELES_META[r ? (r.valor >= r.objetivo ? 'cumplida' : 'no_cumplida') : a.nivel];
            const atrasada = a.nivel === 'en_riesgo' || a.nivel === 'atencion';
            return (
              <li key={m.id} className="flex gap-1 rounded-2xl border border-slate-200/70 bg-white p-3 shadow-tarjeta dark:border-slate-800 dark:bg-slate-900">
                {!cerrado && <Casilla etiqueta={`Seleccionar la meta de ${texto}`} marcada={sel.tiene(m.id)} onChange={() => sel.alternar(m.id)} />}
                <div className="min-w-0 flex-1">
                  <button type="button" disabled={cerrado} onClick={() => setEdicion({ ...m })} className="w-full text-left">
                    <Medidor
                      valor={valor}
                      total={m.objetivo}
                      esperado={r || a.nivel === 'cumplida' ? undefined : a.esperado}
                      distintivo={<Etiqueta tono={nivel.tono} punto>{nivel.texto}</Etiqueta>}
                      rotulo={`${texto} · ${ind.texto.toLowerCase()}`}
                      nota={r ? `Resultado al cierre: ${formato(r.valor)} de ${formato(r.objetivo)} (${r.pct}%).` : a.valor >= a.objetivo ? 'Meta cumplida.' : a.diasRestantes > 0 ? `${atrasada ? `A hoy se esperaban ${formato(Math.round(a.esperado))}. ` : ''}Faltan ${formato(a.objetivo - a.valor)}: ${formato(a.porDia)} ${ind.unidad} por ${a.dias === 'días' ? 'día' : 'día hábil'}${a.proyeccion !== null ? ` · al ritmo actual cerraría en ${formato(a.proyeccion)}` : ''}.` : `Quedó en ${a.pct}%.`}
                    />
                  </button>
                  {ind.tipo === 'ventas' && (
                    <Boton tamano="sm" variante="fantasma" className="mt-1 -ml-3" onClick={() => setDetalle({ titulo: `Meta: ${texto}`, calculo: `Pedidos enviados de ${titulo}${m.vendedor_id ? ` de ${nombres.vendedor(m.vendedor_id)}` : ''}${m.cliente_id ? ` para ${nombres.cliente(m.cliente_id)}` : ''}${m.drogueria_id ? ` por ${nombres.drogueria(m.drogueria_id)}` : ''} (sin borradores, cancelados ni rechazados). Mide ${ind.texto.toLowerCase()}: ${formato(a.valor)} de ${formato(a.objetivo)}.`, pedidos: pedidosDeMeta(m, pedidos, ciclos), nota: 'Con los pedidos guardados en este dispositivo (últimos 90 días).' })}>Ver pedidos</Boton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <DetallePedidos solicitud={detalle} porPedido={porPedido} nombres={nombresDetalle} onCerrar={() => setDetalle(null)} />
      {edicion && (
        <FormMeta
          inicial={edicion}
          nueva={!metas.some((m) => m.id === edicion.id)}
          titulo={titulo}
          vendedores={usuarios.filter((u) => u.rol === 'vendedor' && u.activo && (!ciclo?.equipo_id || modoActivo === 'mes' || u.equipo_id === ciclo.equipo_id))}
          droguerias={droguerias}
          clientes={clientes}
          medicos={medicos}
          nombreCliente={nombres.cliente}
          onCerrar={() => setEdicion(null)}
          onGuardada={async () => { setEdicion(null); await refrescarVista(); void sincronizarYa(); mostrar({ tipo: 'ok', texto: 'Meta guardada.' }); }}
        />
      )}
      {tabla && ciclo && (
        <TablaMetas
          ciclo={ciclo}
          metas={metas}
          vendedores={usuarios.filter((u) => u.rol === 'vendedor' && u.activo && (!ciclo.equipo_id || u.equipo_id === ciclo.equipo_id)).map((u) => ({ id: u.id, nombre: u.nombre_completo }))}
          onCerrar={() => setTabla(false)}
          onGuardada={async (n) => { setTabla(false); await refrescarMetas({ ciclo_id: ciclo.id }); void sincronizarYa(); mostrar({ tipo: 'ok', texto: `${n} cambio${n === 1 ? '' : 's'} guardado${n === 1 ? '' : 's'} en ${ciclo.nombre}.` }); }}
        />
      )}
      {copiando && ciclo && (
        <CopiarMetas destino={ciclo} ciclos={ciclos} equipos={equipos} onCerrar={() => setCopiando(false)} onCopiar={(o, f, r) => void copiarCiclo(o, f, r)} />
      )}
      {ajustando && ciclo && <AjustarMetas ciclo={ciclo} onCerrar={() => setAjustando(false)} onAjustar={(f) => void ajustar(f)} />}
    </div>
  );
}

/** Foto de resultados de un ciclo cerrado (de la nube). */
function useResultados(cicloId: string | null): Map<string, Resultado> | null {
  const [r, setR] = useState<Map<string, Resultado> | null>(null);
  useEffect(() => {
    setR(null);
    const sb = getSupabaseClient();
    if (!sb || !cicloId) return;
    let vivo = true;
    void Promise.resolve(sb.from('resultados_ciclo').select('meta_id,valor,objetivo,pct').eq('ciclo_id', cicloId)).then(({ data }) => {
      if (vivo && Array.isArray(data)) setR(new Map((data as Resultado[]).map((x) => [x.meta_id, { ...x, valor: Number(x.valor), objetivo: Number(x.objetivo), pct: Number(x.pct) }])));
    });
    return () => {
      vivo = false;
    };
  }, [cicloId]);
  return r;
}

const numero = (t: string) => {
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/**
 * Tabla de metas del ciclo: una fila por representante (y una para todo el equipo) y una columna por indicador. Se llena
 * de corrido; «= todos» copia el valor en toda la columna. Solo las metas por representante (sin farmacia, médico ni
 * droguería) se editan aquí; las demás se crean con «Nueva meta».
 */
function TablaMetas({ ciclo, metas, vendedores, onCerrar, onGuardada }: {
  ciclo: LocalCiclo;
  metas: LocalMeta[];
  vendedores: { id: string; nombre: string }[];
  onCerrar: () => void;
  onGuardada: (cambios: number) => void;
}) {
  const filas = [{ id: '', nombre: ciclo.equipo_id ? `Todo el equipo ${ciclo.equipo_nombre ?? ''}`.trim() : 'Toda la empresa' }, ...vendedores];
  const clave = (vendedor: string, ind: IndicadorMeta) => `${vendedor}|${ind}`;
  const simples = useMemo(() => new Map(metas.filter((m) => !m.cliente_id && !m.drogueria_id && !m.medico_id).map((m) => [clave(m.vendedor_id ?? '', m.indicador), m])), [metas]);
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries([...simples.entries()].map(([k, m]) => [k, String(m.objetivo)])));
  const [todos, setTodos] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async () => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const altas: Record<string, unknown>[] = [];
    const bajas: string[] = [];
    for (const f of filas) {
      for (const ind of INDICADORES) {
        const k = clave(f.id, ind.id);
        const n = numero(valores[k] ?? '');
        const previa = simples.get(k);
        if (n && (!previa || previa.objetivo !== n)) altas.push({ id: previa?.id ?? crypto.randomUUID(), ciclo_id: ciclo.id, periodo: null, vendedor_id: f.id || null, cliente_id: null, drogueria_id: null, medico_id: null, indicador: ind.id, objetivo: n, deleted_at: null });
        if (!n && previa) bajas.push(previa.id);
      }
    }
    if (!altas.length && !bajas.length) return onCerrar();
    setGuardando(true);
    setError('');
    if (altas.length) {
      const { error: e } = await sb.from('metas').upsert(altas);
      if (e) { setGuardando(false); return setError(e.message); }
    }
    if (bajas.length) {
      const { error: e } = await sb.from('metas').update({ deleted_at: new Date().toISOString() }).in('id', bajas);
      if (e) { setGuardando(false); return setError(e.message); }
    }
    setGuardando(false);
    onGuardada(altas.length + bajas.length);
  };

  return (
    <Sheet abierto titulo={`Tabla de metas · ${ciclo.nombre}`} onCerrar={onCerrar} ancho="md:max-w-5xl">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">Escribe el objetivo de cada representante para el ciclo. Deja vacío lo que no se mide. La fila de arriba es la meta del equipo completo.</p>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800/60">
              <tr>
                <th className="px-3 py-2 font-semibold">Representante</th>
                {INDICADORES.map((i) => <th key={i.id} className="px-2 py-2 text-right font-semibold">{i.texto}</th>)}
              </tr>
              <tr className="border-t border-slate-200 dark:border-slate-700">
                <td className="px-3 py-1.5 text-xs text-slate-500">Mismo valor para todos</td>
                {INDICADORES.map((i) => (
                  <td key={i.id} className="px-2 py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      <input value={todos[i.id] ?? ''} onChange={(e) => setTodos({ ...todos, [i.id]: e.target.value })} inputMode="numeric" aria-label={`Valor para todos: ${i.texto}`} className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-xs dark:border-slate-700 dark:bg-slate-900" />
                      <button type="button" disabled={!numero(todos[i.id] ?? '')} onClick={() => setValores((v) => ({ ...v, ...Object.fromEntries(vendedores.map((r) => [clave(r.id, i.id), todos[i.id]])) }))} className="rounded-md px-1.5 py-1 text-xs font-semibold text-marca-700 hover:bg-marca-50 disabled:opacity-40 dark:text-marca-300 dark:hover:bg-marca-950">= todos</button>
                    </div>
                  </td>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filas.map((f) => (
                <tr key={f.id || 'equipo'} className={f.id ? '' : 'bg-marca-50/50 dark:bg-marca-950/20'}>
                  <td className="px-3 py-1.5 font-medium">{f.nombre}</td>
                  {INDICADORES.map((i) => (
                    <td key={i.id} className="px-2 py-1.5 text-right">
                      <input
                        value={valores[clave(f.id, i.id)] ?? ''}
                        onChange={(e) => setValores({ ...valores, [clave(f.id, i.id)]: e.target.value.replace(/[^\d.,]/g, '') })}
                        inputMode="numeric"
                        aria-label={`${i.texto} de ${f.nombre}`}
                        className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right dark:border-slate-700 dark:bg-slate-900"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {vendedores.length === 0 && <p className="text-xs text-slate-500">No hay representantes activos en este equipo (revisa el equipo de cada uno en Configuración → Usuarios).</p>}
        {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="primario" disabled={guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar metas'}</Boton>
        </div>
      </div>
    </Sheet>
  );
}

function CopiarMetas({ destino, ciclos, equipos, onCerrar, onCopiar }: {
  destino: LocalCiclo;
  ciclos: LocalCiclo[];
  equipos: { id: string; nombre: string }[];
  onCerrar: () => void;
  onCopiar: (origen: string, factor: number, reemplazar: boolean) => void;
}) {
  const opciones = [...ciclos].filter((c) => c.id !== destino.id).sort((a, b) => Number((b.equipo_id ?? null) === (destino.equipo_id ?? null)) - Number((a.equipo_id ?? null) === (destino.equipo_id ?? null)) || b.inicio.localeCompare(a.inicio));
  const [origen, setOrigen] = useState(opciones[0]?.id ?? '');
  const [pct, setPct] = useState('0');
  const [reemplazar, setReemplazar] = useState(false);
  const equipo = (id: string | null) => (id ? equipos.find((e) => e.id === id)?.nombre ?? 'Equipo' : 'General');
  const factor = 1 + (Number(pct.replace(',', '.')) || 0) / 100;
  return (
    <Sheet abierto titulo={`Copiar metas a ${destino.nombre}`} onCerrar={onCerrar}>
      <div className="flex flex-col gap-3">
        <Campo rotulo="Desde el ciclo">
          <select value={origen} onChange={(e) => setOrigen(e.target.value)} className={estiloInput}>
            {opciones.map((c) => <option key={c.id} value={c.id}>{equipo(c.equipo_id)} · {c.nombre} ({fechaBreve(c.inicio)} – {fechaBreve(c.fin)})</option>)}
          </select>
        </Campo>
        <Campo rotulo="Ajuste de los objetivos (%)" ayuda="0 = iguales. 10 = 10 % más. −5 = 5 % menos.">
          <input value={pct} onChange={(e) => setPct(e.target.value)} inputMode="decimal" className={estiloInput} />
        </Campo>
        <label className="flex items-center gap-2 text-sm"><Casilla etiqueta="Reemplazar" marcada={reemplazar} onChange={setReemplazar} /> Reemplazar las metas que ya tiene {destino.nombre}</label>
        <p className="text-xs text-slate-500">Sin «reemplazar», las metas iguales que ya existan se conservan y no se duplican.</p>
        <div className="flex justify-end gap-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="primario" icono={Copy} disabled={!origen || !(factor > 0)} onClick={() => onCopiar(origen, factor, reemplazar)}>Copiar</Boton>
        </div>
      </div>
    </Sheet>
  );
}

function AjustarMetas({ ciclo, onCerrar, onAjustar }: { ciclo: LocalCiclo; onCerrar: () => void; onAjustar: (factor: number) => void }) {
  const [pct, setPct] = useState('10');
  const factor = 1 + (Number(pct.replace(',', '.')) || 0) / 100;
  return (
    <Sheet abierto titulo={`Ajustar las metas de ${ciclo.nombre}`} onCerrar={onCerrar}>
      <div className="flex flex-col gap-3">
        <Campo rotulo="Porcentaje" ayuda="Positivo sube todos los objetivos; negativo los baja. Se redondea y nunca queda en menos de 1.">
          <input value={pct} onChange={(e) => setPct(e.target.value)} inputMode="decimal" className={estiloInput} />
        </Campo>
        <div className="flex justify-end gap-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="primario" icono={Percent} disabled={!(factor > 0) || factor === 1} onClick={() => onAjustar(factor)}>Ajustar {factor >= 1 ? '+' : ''}{Math.round((factor - 1) * 100)}%</Boton>
        </div>
      </div>
    </Sheet>
  );
}

function FormMeta({ inicial, nueva, titulo, vendedores, droguerias, clientes, medicos, nombreCliente, onCerrar, onGuardada }: {
  inicial: Borrador;
  nueva: boolean;
  titulo: string;
  vendedores: { id: string; nombre_completo: string }[];
  droguerias: { id: string; nombre: string }[];
  clientes: Parameters<typeof SelectorCliente>[0]['clientes'];
  medicos: { id: string; nombre: string; vendedor_id?: string | null }[];
  nombreCliente: (id: string) => string;
  onCerrar: () => void;
  onGuardada: () => void;
}) {
  const [m, setM] = useState(inicial);
  const [objetivo, setObjetivo] = useState(inicial.objetivo ? String(inicial.objetivo) : '');
  const [eligiendo, setEligiendo] = useState(false);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const ind = indicador(m.indicador);
  const indicadores = m.ciclo_id ? INDICADORES : INDICADORES.filter((i) => i.tipo === 'ventas');
  const usaFarmacia = ind.tipo === 'ventas' || m.indicador === 'visitas_farmacias';
  const usaMedico = m.indicador === 'visitas_medicos' || m.indicador === 'medicos_visitados';
  const usaDrogueria = ind.tipo === 'ventas';

  const cambiarIndicador = (v: IndicadorMeta) => {
    const nuevo = indicador(v);
    setM({ ...m, indicador: v, drogueria_id: nuevo.tipo === 'ventas' ? m.drogueria_id : null, medico_id: v === 'visitas_medicos' || v === 'medicos_visitados' ? m.medico_id : null, cliente_id: nuevo.tipo === 'ventas' || v === 'visitas_farmacias' ? m.cliente_id : null });
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabaseClient();
    if (!sb) return;
    const n = Number(objetivo.replace(/\./g, '').replace(',', '.'));
    if (!(n > 0)) return setError('Escribe un objetivo mayor que cero.');
    setGuardando(true);
    const { error: err } = await sb.from('metas').upsert({
      id: m.id, periodo: m.periodo, ciclo_id: m.ciclo_id ?? null, vendedor_id: m.vendedor_id, cliente_id: m.cliente_id, drogueria_id: m.drogueria_id,
      medico_id: m.medico_id ?? null, indicador: m.indicador, objetivo: n, deleted_at: null,
    });
    setGuardando(false);
    if (err) return setError(/uq_metas|duplicate/i.test(err.message) ? `Ya existe una meta igual para ${titulo}: edítala.` : err.message);
    onGuardada();
  };

  return (
    <Sheet abierto titulo={nueva ? `Nueva meta · ${titulo}` : `Meta · ${titulo}`} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="flex flex-col gap-3">
        <Campo rotulo="Qué se mide">
          <select value={m.indicador} onChange={(e) => cambiarIndicador(e.target.value as IndicadorMeta)} className={estiloInput}>
            {indicadores.map((i) => <option key={i.id} value={i.id}>{i.texto}</option>)}
          </select>
        </Campo>
        <Campo rotulo={`Objetivo (${ind.unidad})`}>
          <input value={objetivo} onChange={(e) => setObjetivo(e.target.value)} inputMode="numeric" className={estiloInput} placeholder="Ej.: 5000" />
        </Campo>
        <p className="text-xs text-slate-500">Deja en blanco lo que no aplique. Por ejemplo: solo representante = todo lo suyo; representante + droguería = lo que venda por esa droguería; un médico = las visitas a ese médico.</p>
        <Campo rotulo="Representante">
          <select value={m.vendedor_id ?? ''} onChange={(e) => setM({ ...m, vendedor_id: e.target.value || null })} className={estiloInput}>
            <option value="">{m.ciclo_id ? 'Todo el equipo' : 'Todos'}</option>
            {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre_completo}</option>)}
          </select>
        </Campo>
        {usaFarmacia && (
          <Grupo rotulo="Farmacia">
            <div className="flex gap-2">
              <button type="button" onClick={() => setEligiendo(true)} className={`${estiloInput} flex-1 text-left`}>{m.cliente_id ? nombreCliente(m.cliente_id) : 'Todas'}</button>
              {m.cliente_id && <Boton icono={X} aria-label="Quitar farmacia" onClick={() => setM({ ...m, cliente_id: null })} />}
            </div>
          </Grupo>
        )}
        {usaMedico && (
          <Campo rotulo="Médico">
            <select value={m.medico_id ?? ''} onChange={(e) => setM({ ...m, medico_id: e.target.value || null })} className={estiloInput}>
              <option value="">Todos</option>
              {medicos.filter((x) => !m.vendedor_id || x.vendedor_id === m.vendedor_id).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
          </Campo>
        )}
        {usaDrogueria && (
          <Campo rotulo="Droguería">
            <select value={m.drogueria_id ?? ''} onChange={(e) => setM({ ...m, drogueria_id: e.target.value || null })} className={estiloInput}>
              <option value="">Todas</option>
              {droguerias.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </Campo>
        )}
        {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton type="submit" variante="primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar meta'}</Boton>
        </div>
      </form>
      <SelectorCliente abierto={eligiendo} clientes={clientes} conCarrito={new Set()} permitirNueva={false} onCerrar={() => setEligiendo(false)} onElegir={(c) => { setM({ ...m, cliente_id: c.id }); setEligiendo(false); }} />
    </Sheet>
  );
}
