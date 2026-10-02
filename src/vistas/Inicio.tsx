import { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarDays, CalendarRange, ClipboardPlus, Clock, HeartPulse, Link2, Package, Phone, ShoppingBag, Sparkles, Store, Target, UserCheck } from 'lucide-react';
import type { Usuario } from '../types/pharmacy';
import { obtenerDb } from '../offline/db';
import { useLive } from '../offline/useLive';
import { useEstadoSync } from '../offline/syncStore';
import { getSupabaseClient } from '../services/supabaseClient';
import { Avatar, Boton, BotonClaro, Dato, Destacado, Etiqueta, Pildoras, Subtitulo, Tarjeta, Vacio, Variacion } from '../components/ui/kit';
import { CentroAvisos } from '../avisos/CentroAvisos';
import { Anillo, BarrasRanking, BarrasTendencia, Linea, MAX_PARTES_ANILLO, Medidor } from '../components/graficos/Graficos';
import type { LocalCompraMensual, LocalMeta } from '../offline/types';
import { NIVELES_META, avanceMeta, describirMeta, indicador, pedidosDeMeta, periodoDe, revisarMetasHoy, ritmoMeta } from '../metas/logica';
import { DetallePedidos } from './DetallePedidos';
import type { SolicitudDetalle } from './DetallePedidos';
import { ESTADOS_ETIQUETA, perteneceAGrupo, unidadesDePedido, detallesPorPedido } from './logica';
import { NIVELES_RIESGO, describirRiesgo } from './riesgo';
import type { NivelRiesgo } from './riesgo';
import { useRiesgoFarmacias } from './useRiesgo';
import { useMedicos, useTareas } from '../crm/datos';
import { FilaTarea, TareaForm, useNombresDestino } from '../crm/Tareas';
import { agruparTareas, hoyTexto } from '../offline/crm';
import { irASeccion, prepararPedidoPara } from './navegacion';
import { cuenta, rankingMes, resumenMeses, serieDiaria, serieMensual, topProductosMes, unidadesPorPedido, variacion } from './indicadores';
import type { PuntoMes } from './indicadores';
import { useClientes, useDetalles, useDroguerias, usePedidos, useProductos, useUsuariosNube } from './useDatos';

const saludo = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
};
const formato = (n: number) => n.toLocaleString('es-VE');
const etiquetaDia = (f: string) => {
  const [a, m, d] = f.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '');
};

const etiquetaMes = (m: string) => {
  const [a, mm] = m.split('-').map(Number);
  return new Date(a, mm - 1, 1).toLocaleDateString('es', { month: 'short', year: '2-digit' }).replace('.', '');
};
type Metrica = 'unidades' | 'pedidos' | 'farmacias';
const METRICAS: { id: Metrica; texto: string }[] = [{ id: 'unidades', texto: 'Unidades' }, { id: 'pedidos', texto: 'Pedidos' }, { id: 'farmacias', texto: 'Farmacias' }];
const TITULO_METRICA: Record<Metrica, string> = { unidades: 'Unidades pedidas', pedidos: 'Pedidos', farmacias: 'Farmacias con pedido' };

/** Totales de los últimos 6 meses desde el servidor (todo el historial). null sin conexión: se usan los del dispositivo. */
function useMensualNube(vendedorId: string | null): PuntoMes[] | null {
  const [datos, setDatos] = useState<PuntoMes[] | null>(null);
  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;
    let vivo = true;
    void sb.rpc('resumen_pedidos_mensual', { p_meses: 6, p_vendedor: vendedorId }).then(({ data, error }) => {
      if (!vivo || error || !Array.isArray(data)) return;
      const hoy = new Date();
      const porMes = new Map((data as { mes: string; pedidos: number; unidades: number; farmacias: number }[]).map((f) => [f.mes.slice(0, 7), f]));
      setDatos(Array.from({ length: 6 }, (_, i) => {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() - 5 + i, 1);
        const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const f = porMes.get(mes);
        return { mes, pedidos: Number(f?.pedidos ?? 0), unidades: Number(f?.unidades ?? 0), farmacias: Number(f?.farmacias ?? 0) };
      }));
    });
    return () => {
      vivo = false;
    };
  }, [vendedorId]);
  return datos;
}

/** Conteos que solo existen en el servidor (cuentas por activar, lo que falta homologar). Solo administrador. */
function useConteosAdmin(activo: boolean) {
  const [c, setC] = useState<{ cuentas: number; farmacias: number; productos: number } | null>(null);
  useEffect(() => {
    const sb = getSupabaseClient();
    if (!activo || !sb) return;
    let vivo = true;
    void Promise.all([
      sb.from('dim_usuarios').select('id', { count: 'exact', head: true }).eq('activo', false).is('deleted_at', null),
      sb.from('vw_pendientes_clientes').select('*', { count: 'exact', head: true }),
      sb.from('vw_pendientes_productos').select('*', { count: 'exact', head: true }),
    ]).then(([u, f, p]) => vivo && setC({ cuentas: u.count ?? 0, farmacias: f.count ?? 0, productos: p.count ?? 0 }));
    return () => {
      vivo = false;
    };
  }, [activo]);
  return c;
}

export function Inicio({ usuario, irATab }: { usuario: Usuario; irATab: (t: string) => void }) {
  const db = obtenerDb();
  const esVendedor = usuario.rol === 'vendedor';
  const esAdmin = usuario.rol === 'admin';
  const puedeMetas = esAdmin || usuario.rol === 'gerente';
  const { pendientes, errores, enVivo } = useEstadoSync();
  const clientes = useClientes();
  const productos = useProductos();
  const droguerias = useDroguerias();
  const todos = usePedidos();
  const detalles = useDetalles();
  // El consolidado de compras (grande para la gerencia) solo hace falta para "clientes por atender" del vendedor.
  const compras = useLive(() => (esVendedor ? db.comprasMensual.toArray() : []), [esVendedor], [] as LocalCompraMensual[]);
  const { usuarios } = useUsuariosNube();
  const metas = useLive(() => db.metas.where('periodo').equals(periodoDe(new Date())).toArray(), [], [] as LocalMeta[]);
  const conteos = useConteosAdmin(esAdmin);
  const mensualNube = useMensualNube(esVendedor ? usuario.id : null);
  const [metrica, setMetrica] = useState<Metrica>('unidades');

  const pedidos = useMemo(() => (esVendedor ? todos.filter((p) => p.vendedor_id === usuario.id) : todos), [todos, esVendedor, usuario.id]);
  const nombreCliente = useMemo(() => new Map(clientes.map((c) => [c.id, c.nombre_comercial])), [clientes]);
  const porPedido = useMemo(() => detallesPorPedido(detalles), [detalles]);
  const unidades = useMemo(() => unidadesPorPedido(detalles), [detalles]);
  const nombres = useMemo(() => {
    const u = new Map(usuarios.map((x) => [x.id, x.nombre_completo]));
    const d = new Map(droguerias.map((x) => [x.id, x.nombre]));
    return { vendedor: (id: string) => u.get(id) ?? 'Representante', cliente: (id: string) => nombreCliente.get(id) ?? 'Farmacia', drogueria: (id: string) => d.get(id) ?? 'Droguería' };
  }, [usuarios, droguerias, nombreCliente]);

  // Indicadores del mes, de los últimos 30 días y de los últimos meses.
  const resumen = useMemo(() => resumenMeses(pedidos, unidades), [pedidos, unidades]);
  const diario = useMemo(() => serieDiaria(pedidos, unidades, 30), [pedidos, unidades]);
  const serie = diario.map((p) => ({ clave: p.fecha, etiqueta: etiquetaDia(p.fecha), valor: p[metrica] }));
  const total30 = diario.reduce((a, p) => a + p.pedidos, 0);
  // Mini tendencias de los indicadores: últimas 2 semanas por día.
  const tendencia = useMemo(() => {
    const ult = diario.slice(-14);
    return { pedidos: ult.map((p) => p.pedidos), unidades: ult.map((p) => p.unidades), farmacias: ult.map((p) => p.farmacias) };
  }, [diario]);
  const mensual = useMemo(() => mensualNube ?? serieMensual(pedidos, unidades, 3), [mensualNube, pedidos, unidades]);
  const serieMes = mensual.map((m) => ({ clave: m.mes, etiqueta: etiquetaMes(m.mes), valor: m[metrica] }));
  const cerrados = mensual.slice(0, -1).filter((m) => m.pedidos > 0);
  const promedioMensual = cerrados.length ? Math.round(cerrados.reduce((a, m) => a + m.unidades, 0) / cerrados.length) : null;
  const diasDelMes = new Date().getDate();
  const promDiaUnidades = Math.round(resumen.actual.unidades / diasDelMes);
  const promDiaPedidos = resumen.actual.pedidos / diasDelMes;

  const topProductos = useMemo(() => {
    const nombre = new Map(productos.map((p) => [p.id, p.nombre_comercial]));
    return topProductosMes(pedidos, detalles, (id) => nombre.get(id) ?? 'Producto', 5);
  }, [pedidos, detalles, productos]);
  const porVendedor = useMemo(() => rankingMes(pedidos, unidades, (p) => p.vendedor_id, nombres.vendedor, 5), [pedidos, unidades, nombres]);
  const porDrogueria = useMemo(() => rankingMes(pedidos, unidades, (p) => p.drogueria_id, nombres.drogueria, 5), [pedidos, unidades, nombres]);
  // Reparto del mes por droguería en un anillo: cada droguería conserva su color (orden alfabético de todas, no su puesto
  // del mes). Con más de 6 droguerías, o con una sola, se usan las barras.
  const colorDrogueria = useMemo(() => new Map([...droguerias].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((d, i) => [d.id, i])), [droguerias]);
  const repartoDrogueria = useMemo(() => rankingMes(pedidos, unidades, (p) => p.drogueria_id, nombres.drogueria, 99), [pedidos, unidades, nombres]);
  const anilloDrogueria = droguerias.length <= MAX_PARTES_ANILLO && repartoDrogueria.length >= 2 && repartoDrogueria.every((f) => colorDrogueria.has(f.clave));

  const porProcesar = pedidos.filter((p) => perteneceAGrupo(p.estado, 'por_procesar')).length;
  const enRevision = pedidos.filter((p) => p.estado === 'en_revision').length;
  const parciales = pedidos.filter((p) => p.estado === 'procesado_parcial' && !(porPedido.get(p.id) ?? []).every((d) => d.remanente_derivado_en || d.unidades_pendientes === 0)).length;

  // Farmacias en riesgo: llevan mucho más tiempo del normal sin comprar (según su propio ritmo).
  const { lista: riesgo, deLaNube } = useRiesgoFarmacias(clientes, pedidos, unidades, compras);
  const cuentaRiesgo = (n: NivelRiesgo) => riesgo.filter((f) => f.nivel === n).length;
  // Se abre en el nivel más urgente que tenga farmacias (hasta que la persona elija otro).
  const [nivelElegido, setNivelRiesgo] = useState<Exclude<NivelRiesgo, 'al_dia'> | null>(null);
  const nivelRiesgo = nivelElegido ?? (['en_riesgo', 'atrasada', 'perdida'] as const).find((n) => cuentaRiesgo(n) > 0) ?? 'en_riesgo';
  const delNivel = riesgo.filter((f) => f.nivel === nivelRiesgo);
  const recientes = useMemo(() => [...pedidos].filter(cuenta).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5), [pedidos]);
  const antiguos = useMemo(
    () => pedidos.filter((p) => perteneceAGrupo(p.estado, 'por_procesar') || p.estado === 'en_revision').sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, 5),
    [pedidos]
  );
  // Metas del mes: el avance usa todos los pedidos visibles (una meta de farmacia cuenta los de cualquier representante).
  // Las más urgentes primero (en riesgo, atención…), y dentro de cada nivel la de menor avance.
  const avances = useMemo(
    () =>
      metas
        .map((m) => {
          const a = avanceMeta(m, todos, unidades);
          return { m, a, r: ritmoMeta(m, a.valor), texto: describirMeta(m, nombres) };
        })
        .sort((x, y) => NIVELES_META[x.r.nivel].orden - NIVELES_META[y.r.nivel].orden || x.a.pct - y.a.pct),
    [metas, todos, unidades, nombres]
  );
  // Una vez al día, la base revisa las metas y avisa las que van en riesgo o ya se cumplieron.
  useEffect(() => {
    const sb = getSupabaseClient();
    if (sb) void revisarMetasHoy((fn) => sb.rpc(fn)).catch(() => undefined);
  }, []);

  // ---- Detalle auditable: cada cifra se abre con los pedidos que la forman y cómo se calculó.
  const [detalle, setDetalle] = useState<SolicitudDetalle | null>(null);
  const nombreProducto = useMemo(() => new Map(productos.map((p) => [p.id, p.nombre_comercial])), [productos]);
  const nombresDetalle = useMemo(() => ({ ...nombres, producto: (id: string) => nombreProducto.get(id) ?? 'Producto' }), [nombres, nombreProducto]);
  const hoyClave = diaDe(new Date().toISOString());
  const mesClave = hoyClave.slice(0, 7);
  const delMes = useMemo(() => pedidos.filter((p) => cuenta(p) && diaDe(p.created_at).startsWith(mesClave)), [pedidos, mesClave]);
  const deHoy = useMemo(() => delMes.filter((p) => diaDe(p.created_at) === hoyClave), [delMes, hoyClave]);
  const nombreMes = new Date().toLocaleDateString('es', { month: 'long' });
  const QUE_CUENTA = 'Solo pedidos enviados (no cuenta borradores, cancelados ni rechazados)';
  const NOTA_LOCAL = 'El detalle usa los pedidos guardados en este dispositivo (últimos 90 días).';
  const abrir = (titulo: string, calculo: string, lista: typeof pedidos, extra: Partial<SolicitudDetalle> = {}) => setDetalle({ titulo, calculo, pedidos: lista, ...extra });
  const unidadesDeProducto = (productoId: string) => (p: (typeof pedidos)[number]) => (porPedido.get(p.id) ?? []).filter((d) => d.producto_id === productoId).reduce((a, d) => a + d.unidades_solicitadas, 0);

  const mesAnterior = 'el mes pasado';
  const tomarPedido = (usuario.rol === 'vendedor' || esAdmin) && (
    <Boton variante="primario" icono={ClipboardPlus} onClick={() => irATab('captura')}>
      Tomar pedido
    </Boton>
  );
  const verTodos = (tab: string, texto = 'Ver todos') => (
    <button type="button" onClick={() => irATab(tab)} className="text-xs font-medium text-marca-700 hover:underline dark:text-marca-300">{texto}</button>
  );

  const grafico30 = (
    <Tarjeta>
      {total30 > 0 ? (
        <BarrasTendencia
          puntos={serie}
          unidad={metrica}
          titulo={`${TITULO_METRICA[metrica]} por día`}
          subtitulo="Últimos 30 días · toca un día para ver sus pedidos"
          acciones={<Pildoras valor={metrica} onChange={setMetrica} opciones={METRICAS} etiqueta="Qué medir" />}
          onSeleccionar={(pt) => abrir(`${TITULO_METRICA[metrica]} · ${pt.etiqueta}`, `${QUE_CUENTA} creados el ${pt.etiqueta}. ${metrica === 'farmacias' ? 'Se cuentan farmacias distintas.' : metrica === 'unidades' ? 'Suma de las unidades pedidas.' : 'Número de pedidos.'} Total del día: ${formato(pt.valor)}.`, pedidos.filter((p) => cuenta(p) && diaDe(p.created_at) === pt.clave))}
        />
      ) : (
        <>
          <Subtitulo>Pedidos por día</Subtitulo>
          <Vacio icono={CalendarDays} titulo="Sin pedidos en los últimos 30 días" texto={esVendedor ? 'Cuando tomes pedidos verás aquí tu ritmo diario.' : 'Aquí verás el ritmo diario de pedidos del equipo.'} accion={tomarPedido || undefined} />
        </>
      )}
    </Tarjeta>
  );

  const graficoMeses = (
    <Tarjeta>
      <Linea
        puntos={serieMes}
        unidad={metrica}
        titulo={`${TITULO_METRICA[metrica]} por mes${mensualNube ? '' : ' · con los datos del dispositivo'}`}
        onSeleccionar={(pt) => abrir(`${TITULO_METRICA[metrica]} · ${pt.etiqueta}`, `${QUE_CUENTA} del mes. Total del mes${mensualNube ? ' según el servidor (todo el historial)' : ''}: ${formato(pt.valor)}.`, pedidos.filter((p) => cuenta(p) && diaDe(p.created_at).startsWith(pt.clave)), { nota: `${NOTA_LOCAL} Si el mes es más antiguo, la lista puede estar incompleta aunque el total del gráfico sea correcto.` })}
      />
    </Tarjeta>
  );

  const tarjetaMetas = (
    <Tarjeta>
      <Subtitulo accion={puedeMetas ? verTodos('metas', avances.length ? 'Ver todas' : 'Definir') : undefined}>{esVendedor ? 'Mis metas del mes' : 'Metas del mes'}</Subtitulo>
      {avances.length === 0 ? (
        <Vacio icono={Target} titulo="Sin metas este mes" texto={puedeMetas ? 'Define objetivos por representante, farmacia o droguería.' : 'Tu gerente aún no definió metas para este mes.'} />
      ) : (
        <ul className="flex flex-col gap-4">
          {avances.slice(0, 4).map(({ m, a, r, texto }) => {
            const ind = indicador(m.indicador);
            const nivel = NIVELES_META[r.nivel];
            const atrasada = r.nivel === 'en_riesgo' || r.nivel === 'atencion';
            return (
              <li key={m.id}>
                <Medidor
                  valor={a.valor}
                  total={a.objetivo}
                  esperado={r.nivel === 'cumplida' ? undefined : r.esperado}
                  distintivo={<Etiqueta tono={nivel.tono} punto>{nivel.texto}</Etiqueta>}
                  rotulo={`${esVendedor && m.vendedor_id === usuario.id && !m.cliente_id && !m.drogueria_id ? ind.texto : `${texto} · ${ind.texto.toLowerCase()}`}`}
                  nota={a.valor >= a.objetivo ? '¡Meta cumplida!' : `${atrasada ? `A hoy se esperaban ${formato(Math.round(r.esperado))} · ` : ''}Faltan ${formato(a.objetivo - a.valor)} · ${formato(a.porDia)} ${ind.unidad} por día${a.proyeccion !== null ? ` · proyección ${formato(a.proyeccion)}` : ''}`}
                  onClick={() => abrir(`Meta: ${texto}`, `${QUE_CUENTA} de ${nombreMes}${m.vendedor_id ? ` del representante ${nombres.vendedor(m.vendedor_id)}` : ''}${m.cliente_id ? ` para ${nombres.cliente(m.cliente_id)}` : ''}${m.drogueria_id ? ` por ${nombres.drogueria(m.drogueria_id)}` : ''}. Mide ${ind.texto.toLowerCase()}: ${formato(a.valor)} de ${formato(a.objetivo)} (${a.pct}%). Faltan ${a.diasRestantes} días.`, pedidosDeMeta(m, todos))}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Tarjeta>
  );

  const ultimos = (
    <Tarjeta className="!p-0">
      <div className="px-4 pt-4 sm:px-5 sm:pt-5"><Subtitulo accion={verTodos('pedidos')}>{esVendedor ? 'Mis últimos pedidos' : 'Últimos pedidos'}</Subtitulo></div>
      {recientes.length === 0 ? (
        <Vacio titulo="Aún no hay pedidos" />
      ) : (
        <>
          <div className="hidden overflow-x-auto px-3 pb-3 md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-slate-500">
                  <th className="rounded-l-xl bg-slate-50 px-3 py-2.5 font-semibold dark:bg-slate-800/60">Pedido</th>
                  <th className="bg-slate-50 px-3 py-2.5 font-semibold dark:bg-slate-800/60">Farmacia</th>
                  <th className="bg-slate-50 px-3 py-2.5 font-semibold dark:bg-slate-800/60">Fecha</th>
                  <th className="bg-slate-50 px-3 py-2.5 text-right font-semibold dark:bg-slate-800/60">Unidades</th>
                  <th className="rounded-r-xl bg-slate-50 px-3 py-2.5 font-semibold dark:bg-slate-800/60">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {recientes.map((p) => (
                  <tr key={p.id} onClick={() => abrir(`Pedido ${p.correlativo}`, `${nombreCliente.get(p.cliente_id) ?? 'Farmacia'} · ${nombres.drogueria(p.drogueria_id)}`, [p])} className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-3 py-3 font-semibold text-slate-900 dark:text-white">{p.correlativo}</td>
                    <td className="max-w-56 truncate px-3 py-3 text-slate-700 dark:text-slate-200">{nombreCliente.get(p.cliente_id) ?? 'Farmacia'}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-500">{new Date(p.created_at).toLocaleString('es', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-900 dark:text-white">{formato(unidadesDePedido(porPedido.get(p.id) ?? []).solicitadas)}</td>
                    <td className="px-3 py-3"><Etiqueta tono={ESTADOS_ETIQUETA[p.estado].tono} punto>{ESTADOS_ETIQUETA[p.estado].texto}</Etiqueta></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-2 px-3 pb-3 md:hidden">
            {recientes.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => abrir(`Pedido ${p.correlativo}`, `${nombreCliente.get(p.cliente_id) ?? 'Farmacia'} · ${nombres.drogueria(p.drogueria_id)}`, [p])} className="flex w-full items-center gap-3 rounded-xl bg-slate-50 p-3 text-left transition-colors active:bg-slate-100 dark:bg-slate-800/50">
                  <Avatar nombre={nombreCliente.get(p.cliente_id) ?? 'Farmacia'} tamano={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{nombreCliente.get(p.cliente_id) ?? 'Farmacia'}</span>
                    <span className="block text-xs text-slate-500"><span className="font-semibold text-marca-700 dark:text-marca-300">{p.correlativo}</span> · {new Date(p.created_at).toLocaleString('es', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">{formato(unidadesDePedido(porPedido.get(p.id) ?? []).solicitadas)} uds</span>
                    <Etiqueta tono={ESTADOS_ETIQUETA[p.estado].tono} punto>{ESTADOS_ETIQUETA[p.estado].texto}</Etiqueta>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Tarjeta>
  );

  const masPedidos = (
    <Tarjeta>
      <Subtitulo>Productos más pedidos del mes</Subtitulo>
      <BarrasRanking filas={topProductos} unidad="unidades" vacio="Aún no hay pedidos este mes." onSeleccionar={(id) => abrir(`${nombreProducto.get(id) ?? 'Producto'} · ${nombreMes}`, `${QUE_CUENTA} de ${nombreMes} que incluyen este producto. Las unidades son solo las de este producto.`, delMes.filter((p) => (porPedido.get(p.id) ?? []).some((d) => d.producto_id === id)), { unidadesDe: unidadesDeProducto(id) })} />
    </Tarjeta>
  );

  // Tareas de hoy y vencidas (las propias; la gerencia ve las suyas aquí y las del equipo en Tareas).
  const tareas = useTareas();
  const medicos = useMedicos();
  const destinoTarea = useNombresDestino(clientes, medicos);
  const [tareaRiesgo, setTareaRiesgo] = useState<{ id: string; nombre: string } | null>(null);
  const misTareas = useMemo(() => agruparTareas(tareas.filter((t) => t.vendedor_id === usuario.id)), [tareas, usuario.id]);
  const urgentes = [...misTareas.vencidas, ...misTareas.hoy];
  const tarjetaTareas = (urgentes.length > 0 || esVendedor) && usuario.rol !== 'teletransferencista' && (
    <Tarjeta>
      <Subtitulo accion={verTodos('tareas', 'Ver todas')}>Tareas de hoy{urgentes.length ? ` · ${urgentes.length}` : ''}</Subtitulo>
      {urgentes.length === 0 ? (
        <Vacio titulo="Nada pendiente para hoy" texto={misTareas.proximas.length ? `${misTareas.proximas.length} tarea${misTareas.proximas.length === 1 ? '' : 's'} para los próximos días.` : 'Anota lo que tengas que hacer en «Mis tareas».'} />
      ) : (
        <ul className="-my-2 divide-y divide-slate-100 dark:divide-slate-800">
          {urgentes.slice(0, 4).map((t) => <FilaTarea key={t.id} t={t} destino={destinoTarea(t)} hoy={hoyTexto()} onEditar={() => irATab('tareas')} />)}
        </ul>
      )}
    </Tarjeta>
  );

  const tarjetaRiesgo = (
    <Tarjeta>
      <Subtitulo accion={verTodos('clientes', esVendedor ? 'Mis clientes' : 'Ver clientes')}>Farmacias en riesgo</Subtitulo>
      {riesgo.length === 0 ? (
        <Vacio icono={HeartPulse} titulo="Sin historial de compras aún" texto="Cuando tus farmacias compren, NOVA aprende cada cuánto lo hacen y te avisa si alguna se atrasa." />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Pildoras
              valor={nivelRiesgo}
              onChange={setNivelRiesgo}
              etiqueta="Nivel de riesgo"
              opciones={[
                { id: 'en_riesgo', texto: `En riesgo · ${cuentaRiesgo('en_riesgo')}` },
                { id: 'atrasada', texto: `Atrasadas · ${cuentaRiesgo('atrasada')}` },
                { id: 'perdida', texto: `Perdidas · ${cuentaRiesgo('perdida')}` },
              ]}
            />
            <span className="text-xs text-slate-500">{deLaNube ? 'Con el historial del último año' : 'Con los datos de este equipo'}</span>
          </div>
          {delNivel.length === 0 ? (
            <Vacio titulo={nivelRiesgo === 'en_riesgo' ? 'Ninguna en riesgo' : nivelRiesgo === 'atrasada' ? 'Ninguna atrasada' : 'Ninguna perdida'} texto="Todas compran a su ritmo de siempre." />
          ) : (
            <ul className="-my-2 divide-y divide-slate-100 dark:divide-slate-800">
              {delNivel.slice(0, 5).map((f) => (
                <li key={f.cliente.id} className="flex items-center gap-3 py-2.5">
                  <Avatar nombre={f.cliente.nombre_comercial} tamano={36} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-slate-900 dark:text-white"><span className="truncate">{f.cliente.nombre_comercial}</span><Etiqueta tono={NIVELES_RIESGO[f.nivel].tono} punto>{NIVELES_RIESGO[f.nivel].texto}</Etiqueta></p>
                    <p className="truncate text-xs text-slate-500">{describirRiesgo(f)}</p>
                  </div>
                  {f.cliente.telefono && (
                    <a href={`tel:${f.cliente.telefono}`} aria-label={`Llamar a ${f.cliente.nombre_comercial}`} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-marca-700 hover:bg-marca-50 dark:text-marca-300 dark:hover:bg-marca-950"><Phone className="h-4 w-4" aria-hidden /></a>
                  )}
                  {esVendedor && <Boton tamano="sm" variante="fantasma" onClick={() => setTareaRiesgo({ id: f.cliente.id, nombre: f.cliente.nombre_comercial })}>Tarea</Boton>}
                  {(esVendedor || esAdmin) && (
                    <Boton tamano="sm" variante="secundario" onClick={() => { prepararPedidoPara(f.cliente.id); irATab('captura'); }}>Pedido</Boton>
                  )}
                </li>
              ))}
            </ul>
          )}
          {delNivel.length > 5 && <p className="mt-3 text-xs text-slate-500">…y {delNivel.length - 5} más en {esVendedor ? 'Mis clientes' : 'Clientes'}.</p>}
        </>
      )}
    </Tarjeta>
  );

  const miFichero = (
    <Tarjeta>
      <Subtitulo>Mi fichero este mes</Subtitulo>
      <Medidor
        valor={resumen.actual.clientes}
        total={clientes.length}
        rotulo="Farmacias con pedido"
        nota={clientes.length === 0 ? 'Agrega farmacias a tu fichero desde "Mis clientes".' : `${formato(Math.max(0, clientes.length - resumen.actual.clientes))} farmacias sin pedido este mes.`}
        onClick={() => abrir('Farmacias con pedido este mes', `Farmacias distintas de tu fichero (${formato(clientes.length)}) con al menos un pedido en ${nombreMes}: ${formato(resumen.actual.clientes)}. ${QUE_CUENTA}.`, delMes)}
      />
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
        <Mini rotulo="Unidades por pedido" valor={resumen.actual.pedidos ? formato(Math.round(resumen.actual.unidades / resumen.actual.pedidos)) : '—'} />
        <Mini rotulo="Farmacias en fichero" valor={formato(clientes.length)} />
      </dl>
    </Tarjeta>
  );

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <Destacado
        icono={Sparkles}
        titulo={`${saludo()}, ${usuario.nombre_completo.split(' ')[0]}`}
        distintivo={enVivo ? 'En vivo' : undefined}
        texto={`${esVendedor ? 'Tu' : 'El equipo en'} ${nombreMes}: ${formato(resumen.actual.pedidos)} pedido${resumen.actual.pedidos === 1 ? '' : 's'} · ${formato(resumen.actual.unidades)} unidades · ${formato(resumen.actual.clientes)} farmacias`}
        acciones={
          <>
            <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-semibold text-white"><CalendarDays className="h-3.5 w-3.5" aria-hidden />{new Date().toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            {(esVendedor || esAdmin) && <BotonClaro icono={ClipboardPlus} onClick={() => irATab('captura')}>Tomar pedido</BotonClaro>}
            {!esVendedor && porProcesar + enRevision > 0 && (esAdmin || usuario.rol === 'teletransferencista') && (
              <BotonClaro icono={Clock} onClick={() => irATab('por_procesar')}>Por procesar · {porProcesar + enRevision}</BotonClaro>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <Dato icono={ShoppingBag} serie={tendencia.pedidos} rotulo="Pedidos del mes" valor={formato(resumen.actual.pedidos)} nota={<Variacion pct={variacion(resumen.actual.pedidos, resumen.anterior.pedidos)} periodo={mesAnterior} />} onClick={() => abrir(`Pedidos de ${nombreMes}`, `${QUE_CUENTA} creados desde el 1 de ${nombreMes}: ${formato(resumen.actual.pedidos)}. El mes pasado: ${formato(resumen.anterior.pedidos)}.`, delMes)} />
        <Dato icono={Package} serie={tendencia.unidades} rotulo="Unidades del mes" valor={formato(resumen.actual.unidades)} nota={<Variacion pct={variacion(resumen.actual.unidades, resumen.anterior.unidades)} periodo={mesAnterior} />} onClick={() => abrir(`Unidades de ${nombreMes}`, `Suma de las unidades pedidas en cada pedido de ${nombreMes}: ${formato(resumen.actual.unidades)}. El mes pasado: ${formato(resumen.anterior.unidades)}. ${QUE_CUENTA}.`, delMes)} />
        <Dato icono={Activity} rotulo="Promedio por día" valor={`${formato(promDiaUnidades)} uds`} nota={`${promDiaPedidos.toLocaleString('es-VE', { maximumFractionDigits: 1 })} pedidos por día`} onClick={() => abrir('Promedio por día', `${formato(resumen.actual.unidades)} unidades ÷ ${diasDelMes} días transcurridos de ${nombreMes} = ${formato(promDiaUnidades)} unidades por día. ${formato(resumen.actual.pedidos)} pedidos ÷ ${diasDelMes} días = ${promDiaPedidos.toLocaleString('es-VE', { maximumFractionDigits: 1 })} pedidos por día.`, delMes)} />
        <Dato icono={Store} serie={tendencia.farmacias} rotulo="Farmacias con pedido hoy" valor={formato(resumen.hoy.clientes)} nota={`${formato(resumen.actual.clientes)} en el mes · ${formato(resumen.hoy.pedidos)} pedido${resumen.hoy.pedidos === 1 ? '' : 's'} hoy`} onClick={() => abrir('Pedidos de hoy', `Farmacias distintas con al menos un pedido hoy: ${formato(resumen.hoy.clientes)} (${formato(resumen.hoy.pedidos)} pedidos). En el mes: ${formato(resumen.actual.clientes)} farmacias. ${QUE_CUENTA}.`, deHoy)} />
        <Dato icono={CalendarRange} serie={mensual.length > 1 ? mensual.map((m) => m.unidades) : undefined} rotulo="Promedio por mes" valor={promedioMensual === null ? '—' : `${formato(promedioMensual)} uds`} nota={cerrados.length ? `Últimos ${cerrados.length} mes${cerrados.length === 1 ? '' : 'es'} cerrados` : 'Aún sin meses cerrados'} onClick={() => abrir('Promedio por mes', cerrados.length ? `Promedio de unidades de los meses cerrados con pedidos: ${cerrados.map((m) => `${etiquetaMes(m.mes)} ${formato(m.unidades)}`).join(' + ')} = ${formato(cerrados.reduce((a, m) => a + m.unidades, 0))} ÷ ${cerrados.length} = ${formato(promedioMensual ?? 0)}. No incluye el mes en curso.` : 'Todavía no hay meses cerrados con pedidos.', pedidos.filter((p) => cuenta(p) && cerrados.some((m) => diaDe(p.created_at).startsWith(m.mes))), { nota: NOTA_LOCAL })} />
        {esVendedor ? (
          pendientes > 0 ? (
            <Dato icono={Clock} rotulo="Por enviar" valor={pendientes} tono={errores > 0 ? 'peligro' : 'aviso'} nota={errores > 0 ? 'Hay pedidos con error' : 'Se envían al tener señal'} />
          ) : (
            <Dato icono={HeartPulse} rotulo="Farmacias en riesgo" valor={cuentaRiesgo('en_riesgo')} tono={cuentaRiesgo('en_riesgo') > 0 ? 'peligro' : undefined} nota={`${cuentaRiesgo('atrasada')} atrasadas · ${cuentaRiesgo('perdida')} perdidas`} onClick={() => irATab('clientes')} />
          )
        ) : (
          <Dato icono={Clock} rotulo="Por procesar" valor={porProcesar} tono={porProcesar > 0 ? 'aviso' : undefined} nota={`${enRevision} en revisión${parciales ? ` · ${parciales} parciales` : ''}`} onClick={() => abrir('Por procesar', `Pedidos esperando a la mesa de transferencias (enviados o en proceso): ${porProcesar}. En revisión especial: ${enRevision}.`, pedidos.filter((p) => perteneceAGrupo(p.estado, 'por_procesar') || p.estado === 'en_revision'))} />
        )}
      </div>

      {esAdmin && conteos && (conteos.cuentas > 0 || conteos.farmacias > 0 || conteos.productos > 0) && (
        <Tarjeta>
          <Subtitulo>Pendiente de tu parte</Subtitulo>
          <div className="flex flex-wrap gap-2">
            {conteos.cuentas > 0 && (
              <Boton icono={UserCheck} onClick={() => irASeccion(irATab, 'config', 'usuarios')}>
                {conteos.cuentas} cuenta{conteos.cuentas === 1 ? '' : 's'} por activar
              </Boton>
            )}
            {(conteos.farmacias > 0 || conteos.productos > 0) && (
              <Boton icono={Link2} onClick={() => irASeccion(irATab, 'datos', 'pendientes')}>
                {formato(conteos.farmacias)} farmacias y {formato(conteos.productos)} productos sin homologar
              </Boton>
            )}
          </div>
        </Tarjeta>
      )}

      <div className="grid items-start gap-4 lg:gap-5 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-5 xl:col-span-8">
          {grafico30}
          {ultimos}
          {esVendedor ? (
            tarjetaRiesgo
          ) : (
            <Tarjeta>
              <Subtitulo accion={(esAdmin || usuario.rol === 'teletransferencista') && antiguos.length > 0 ? verTodos('por_procesar', 'Ir a procesar') : undefined}>
                Esperando más tiempo
              </Subtitulo>
              {antiguos.length === 0 ? (
                <Vacio titulo="Sin pedidos en espera" />
              ) : (
                <ul className="-my-2 divide-y divide-slate-100 dark:divide-slate-800">
                  {antiguos.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{nombreCliente.get(p.cliente_id) ?? 'Farmacia'}</p>
                        <p className="text-xs text-slate-500">{p.correlativo} · {new Date(p.created_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</p>
                      </div>
                      <Etiqueta tono={ESTADOS_ETIQUETA[p.estado].tono} punto>{ESTADOS_ETIQUETA[p.estado].texto}</Etiqueta>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
          )}
          {!esVendedor && tarjetaRiesgo}
          <div className="grid gap-4 lg:gap-5 md:grid-cols-2">
            {masPedidos}
            {esVendedor ? miFichero : (
            <Tarjeta>
              <Subtitulo>Unidades por representante · este mes</Subtitulo>
              <BarrasRanking filas={porVendedor} unidad="unidades" vacio="Aún no hay pedidos este mes." onSeleccionar={(id) => abrir(`${nombres.vendedor(id)} · ${nombreMes}`, `${QUE_CUENTA} de ${nombreMes} tomados por este representante. Suma de unidades pedidas.`, delMes.filter((p) => p.vendedor_id === id))} />
            </Tarjeta>
            )}
          </div>
          {graficoMeses}
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:gap-5 xl:col-span-4">
          {tarjetaMetas}
          {tarjetaTareas}
          <CentroAvisos onAbrir={(n) => (n.tipo.startsWith('meta') ? puedeMetas && irATab('metas') : n.tipo.startsWith('tarea') ? irATab('tareas') : irATab('pedidos'))} />
          {!esVendedor && (
            <Tarjeta>
              <Subtitulo>Unidades por droguería · este mes</Subtitulo>
              {anilloDrogueria ? (
                <Anillo
                  partes={repartoDrogueria.map((f) => ({ ...f, color: colorDrogueria.get(f.clave) ?? 0 }))}
                  unidad="unidades"
                  onSeleccionar={(id) => abrir(`${nombres.drogueria(id)} · ${nombreMes}`, `${QUE_CUENTA} de ${nombreMes} enviados a esta droguería. Suma de unidades pedidas.`, delMes.filter((p) => p.drogueria_id === id))}
                />
              ) : (
                <BarrasRanking filas={porDrogueria} unidad="unidades" vacio="Aún no hay pedidos este mes." onSeleccionar={(id) => abrir(`${nombres.drogueria(id)} · ${nombreMes}`, `${QUE_CUENTA} de ${nombreMes} enviados a esta droguería. Suma de unidades pedidas.`, delMes.filter((p) => p.drogueria_id === id))} />
              )}
            </Tarjeta>
          )}
        </div>
      </div>
      <DetallePedidos solicitud={detalle} porPedido={porPedido} nombres={nombresDetalle} onCerrar={() => setDetalle(null)} />
      {tareaRiesgo && (
        <TareaForm
          sugerida={{ titulo: `Recuperar a ${tareaRiesgo.nombre}: llamar o visitar`, cliente_id: tareaRiesgo.id, origen: 'riesgo' }}
          vendedorId={usuario.id}
          clientes={clientes}
          medicos={medicos}
          onCerrar={() => setTareaRiesgo(null)}
          onGuardada={() => setTareaRiesgo(null)}
        />
      )}
    </div>
  );
}

/** Día local (YYYY-MM-DD) de una fecha ISO: el mismo criterio que los gráficos. */
function diaDe(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}


function Mini({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{rotulo}</dt>
      <dd className="text-lg font-semibold text-slate-900 dark:text-white">{valor}</dd>
    </div>
  );
}
