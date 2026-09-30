import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Plus, Target, Trash2, X } from 'lucide-react';
import { Sheet } from '../components/capture/Sheet';
import { Medidor } from '../components/graficos/Graficos';
import { BarraSeleccion, Boton, Campo, Casilla, Grupo, PageHeader, Segmentado, Tarjeta, Vacio, estiloInput, useAviso, useConfirmar, useSeleccion } from '../components/ui/kit';
import { obtenerDb } from '../offline/db';
import { sincronizarYa } from '../offline/motor';
import { useLive } from '../offline/useLive';
import type { IndicadorMeta, LocalMeta } from '../offline/types';
import { SelectorCliente } from '../pedido/SelectorCliente';
import { getSupabaseClient } from '../services/supabaseClient';
import { unidadesPorPedido } from '../vistas/indicadores';
import { useClientes, useDetalles, useDroguerias, usePedidos, useUsuariosNube } from '../vistas/useDatos';
import { INDICADORES, avanceMeta, describirMeta, indicador, mesSiguiente, periodoDe } from './logica';

const formato = (n: number) => n.toLocaleString('es-VE');
const nombreMes = (periodo: string) => {
  const [a, m] = periodo.split('-').map(Number);
  const t = new Date(a, m - 1, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

type Borrador = Omit<LocalMeta, 'updated_at'>;

/** Metas del mes por representante, farmacia y/o droguería (cualquier combinación), con su avance en vivo. */
export function MetasVista() {
  const db = obtenerDb();
  const [periodo, setPeriodo] = useState(() => periodoDe(new Date()));
  const metas = useLive(() => db.metas.where('periodo').equals(periodo).toArray(), [periodo], [] as LocalMeta[]);
  const anteriores = useLive(() => db.metas.where('periodo').equals(mesSiguiente(periodo, -1)).toArray(), [periodo], [] as LocalMeta[]);
  const pedidos = usePedidos();
  const detalles = useDetalles();
  const clientes = useClientes();
  const droguerias = useDroguerias();
  const { usuarios } = useUsuariosNube();
  const unidades = useMemo(() => unidadesPorPedido(detalles), [detalles]);
  const [edicion, setEdicion] = useState<Borrador | null>(null);
  const sel = useSeleccion();
  const { mostrar, nodo } = useAviso();
  const { confirmar, nodo: nodoConfirmar } = useConfirmar();

  const nombres = useMemo(() => {
    const u = new Map(usuarios.map((x) => [x.id, x.nombre_completo]));
    const c = new Map(clientes.map((x) => [x.id, x.nombre_comercial]));
    const d = new Map(droguerias.map((x) => [x.id, x.nombre]));
    return { vendedor: (id: string) => u.get(id) ?? 'Representante', cliente: (id: string) => c.get(id) ?? 'Farmacia', drogueria: (id: string) => d.get(id) ?? 'Droguería' };
  }, [usuarios, clientes, droguerias]);

  const filas = useMemo(
    () => metas.map((m) => ({ m, a: avanceMeta(m, pedidos, unidades), texto: describirMeta(m, nombres) })).sort((x, y) => x.texto.localeCompare(y.texto)),
    [metas, pedidos, unidades, nombres]
  );

  const eliminar = async (ids: string[]) => {
    const sb = getSupabaseClient();
    if (!sb || !(await confirmar(`Eliminar ${ids.length} meta${ids.length === 1 ? '' : 's'}`, 'Los pedidos no cambian; solo deja de medirse el avance.', { accion: 'Eliminar', peligro: true }))) return;
    const { error } = await sb.from('metas').update({ deleted_at: new Date().toISOString() }).in('id', ids);
    if (error) return mostrar({ tipo: 'error', texto: error.message });
    sel.limpiar();
    await sincronizarYa();
  };

  const copiarAnterior = async () => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const nuevas = anteriores.map((m) => ({ periodo, vendedor_id: m.vendedor_id, cliente_id: m.cliente_id, drogueria_id: m.drogueria_id, indicador: m.indicador, objetivo: m.objetivo }));
    const { error } = await sb.from('metas').insert(nuevas);
    if (error) return mostrar({ tipo: 'error', texto: error.message });
    await sincronizarYa();
    mostrar({ tipo: 'ok', texto: `${nuevas.length} metas copiadas de ${nombreMes(mesSiguiente(periodo, -1))}.` });
  };

  const nueva = (): Borrador => ({ id: crypto.randomUUID(), periodo, vendedor_id: null, cliente_id: null, drogueria_id: null, indicador: 'unidades', objetivo: 0 });

  return (
    <div>
      <PageHeader
        titulo="Metas"
        descripcion="Objetivos del mes por representante, farmacia o droguería (o combinados). El avance se ve en el Resumen de cada uno."
        acciones={<Boton variante="primario" icono={Plus} onClick={() => setEdicion(nueva())}>Nueva meta</Boton>}
      />
      {nodo}
      {nodoConfirmar}
      <div className="mb-3 flex items-center gap-2">
        <Boton tamano="sm" variante="fantasma" icono={ChevronLeft} aria-label="Mes anterior" onClick={() => setPeriodo(mesSiguiente(periodo, -1))} />
        <p className="min-w-40 text-center text-sm font-semibold text-slate-900 dark:text-white">{nombreMes(periodo)}</p>
        <Boton tamano="sm" variante="fantasma" icono={ChevronRight} aria-label="Mes siguiente" onClick={() => setPeriodo(mesSiguiente(periodo))} />
      </div>
      <BarraSeleccion cantidad={sel.cantidad} onLimpiar={sel.limpiar}>
        <Boton tamano="sm" variante="peligro" icono={Trash2} onClick={() => void eliminar([...sel.ids])}>Eliminar</Boton>
      </BarraSeleccion>

      {filas.length === 0 ? (
        <Tarjeta>
          <Vacio
            icono={Target}
            titulo={`Sin metas para ${nombreMes(periodo).toLowerCase()}`}
            texto="Crea una meta de unidades, pedidos o farmacias con pedido."
            accion={
              <div className="flex flex-wrap justify-center gap-2">
                <Boton variante="primario" icono={Plus} onClick={() => setEdicion(nueva())}>Nueva meta</Boton>
                {anteriores.length > 0 && <Boton icono={Copy} onClick={() => void copiarAnterior()}>Copiar las {anteriores.length} del mes anterior</Boton>}
              </div>
            }
          />
        </Tarjeta>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filas.map(({ m, a, texto }) => {
            const ind = indicador(m.indicador);
            return (
              <li key={m.id} className="flex gap-1 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <Casilla etiqueta={`Seleccionar la meta de ${texto}`} marcada={sel.tiene(m.id)} onChange={() => sel.alternar(m.id)} />
                <button type="button" onClick={() => setEdicion({ ...m })} className="min-w-0 flex-1 text-left">
                  <Medidor
                    valor={a.valor}
                    total={a.objetivo}
                    rotulo={`${texto} · ${ind.texto.toLowerCase()}`}
                    nota={a.valor >= a.objetivo ? 'Meta cumplida.' : a.diasRestantes > 0 ? `Faltan ${formato(a.objetivo - a.valor)}: ${formato(a.porDia)} ${ind.unidad} por día${a.proyeccion !== null ? ` · al ritmo actual cerraría en ${formato(a.proyeccion)}` : ''}.` : `Quedó en ${a.pct}%.`}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {edicion && (
        <FormMeta
          inicial={edicion}
          nueva={!metas.some((m) => m.id === edicion.id)}
          vendedores={usuarios.filter((u) => u.rol === 'vendedor' && u.activo)}
          droguerias={droguerias}
          clientes={clientes}
          nombreCliente={nombres.cliente}
          onCerrar={() => setEdicion(null)}
          onGuardada={async () => { setEdicion(null); await sincronizarYa(); mostrar({ tipo: 'ok', texto: 'Meta guardada.' }); }}
        />
      )}
    </div>
  );
}

function FormMeta({ inicial, nueva, vendedores, droguerias, clientes, nombreCliente, onCerrar, onGuardada }: {
  inicial: Borrador;
  nueva: boolean;
  vendedores: { id: string; nombre_completo: string }[];
  droguerias: { id: string; nombre: string }[];
  clientes: Parameters<typeof SelectorCliente>[0]['clientes'];
  nombreCliente: (id: string) => string;
  onCerrar: () => void;
  onGuardada: () => void;
}) {
  const [m, setM] = useState(inicial);
  const [objetivo, setObjetivo] = useState(inicial.objetivo ? String(inicial.objetivo) : '');
  const [eligiendo, setEligiendo] = useState(false);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabaseClient();
    if (!sb) return;
    const n = Number(objetivo.replace(/\./g, '').replace(',', '.'));
    if (!(n > 0)) return setError('Escribe un objetivo mayor que cero.');
    setGuardando(true);
    const { error: err } = await sb.from('metas').upsert({ id: m.id, periodo: m.periodo, vendedor_id: m.vendedor_id, cliente_id: m.cliente_id, drogueria_id: m.drogueria_id, indicador: m.indicador, objetivo: n, deleted_at: null });
    setGuardando(false);
    if (err) return setError(/uq_metas|duplicate/i.test(err.message) ? 'Ya existe una meta igual para este mes: edítala.' : err.message);
    onGuardada();
  };

  return (
    <Sheet abierto titulo={nueva ? `Nueva meta · ${nombreMes(m.periodo)}` : `Meta · ${nombreMes(m.periodo)}`} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="flex flex-col gap-3">
        <Grupo rotulo="Qué se mide">
          <Segmentado valor={m.indicador} onChange={(v) => setM({ ...m, indicador: v as IndicadorMeta })} opciones={INDICADORES.map((i) => ({ id: i.id, texto: i.texto }))} />
        </Grupo>
        <Campo rotulo={`Objetivo (${indicador(m.indicador).unidad})`}>
          <input value={objetivo} onChange={(e) => setObjetivo(e.target.value)} inputMode="numeric" className={estiloInput} placeholder="Ej.: 5000" />
        </Campo>
        <p className="text-xs text-slate-500">Deja en blanco lo que no aplique. Por ejemplo: solo representante = todo lo que venda; representante + droguería = lo que venda por esa droguería.</p>
        <Campo rotulo="Representante">
          <select value={m.vendedor_id ?? ''} onChange={(e) => setM({ ...m, vendedor_id: e.target.value || null })} className={estiloInput}>
            <option value="">Todos</option>
            {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre_completo}</option>)}
          </select>
        </Campo>
        <Grupo rotulo="Farmacia">
          <div className="flex gap-2">
            <button type="button" onClick={() => setEligiendo(true)} className={`${estiloInput} flex-1 text-left`}>{m.cliente_id ? nombreCliente(m.cliente_id) : 'Todas'}</button>
            {m.cliente_id && <Boton icono={X} aria-label="Quitar farmacia" onClick={() => setM({ ...m, cliente_id: null })} />}
          </div>
        </Grupo>
        <Campo rotulo="Droguería">
          <select value={m.drogueria_id ?? ''} onChange={(e) => setM({ ...m, drogueria_id: e.target.value || null })} className={estiloInput}>
            <option value="">Todas</option>
            {droguerias.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
        </Campo>
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
