import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Activity, AlertTriangle, ArrowRight, CalendarDays, CalendarRange, ClipboardPlus, Clock, Link2, Package, ShoppingBag, Store, Target, UserCheck, Users } from 'lucide-react';
import type { Usuario } from '../types/pharmacy';
import { obtenerDb } from '../offline/db';
import { useLive } from '../offline/useLive';
import { useEstadoSync } from '../offline/syncStore';
import { getSupabaseClient } from '../services/supabaseClient';
import { Boton, Dato, Etiqueta, PageHeader, Segmentado, Subtitulo, Tarjeta, Vacio, Variacion } from '../components/ui/kit';
import { BarrasRanking, Columnas, Medidor } from '../components/graficos/Graficos';
import type { LocalMeta, LocalNotificacion } from '../offline/types';
import { avanceMeta, describirMeta, indicador, periodoDe } from '../metas/logica';
import { actividadDeClientes, clientesPorAtender, ESTADOS_ETIQUETA, perteneceAGrupo, unidadesDePedido, detallesPorPedido } from './logica';
import { irASeccion, prepararPedidoPara } from './navegacion';
import { cuenta, rankingMes, resumenMeses, serieDiaria, serieMensual, topProductosMes, unidadesPorPedido, variacion } from './indicadores';
import type { PuntoMes } from './indicadores';
import { ultimaCompraPorCliente, ultimoPedidoPorCliente, useClientes, useCompras, useDetalles, useDroguerias, usePedidos, useProductos, useUsuariosNube } from './useDatos';

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
  const { pendientes, errores } = useEstadoSync();
  const clientes = useClientes();
  const productos = useProductos();
  const droguerias = useDroguerias();
  const todos = usePedidos();
  const detalles = useDetalles();
  const compras = useCompras();
  const { usuarios } = useUsuariosNube();
  const avisos = useLive(() => db.notificaciones.filter((n) => !n.leida).toArray(), [], [] as LocalNotificacion[]);
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

  const porProcesar = pedidos.filter((p) => perteneceAGrupo(p.estado, 'por_procesar')).length;
  const enRevision = pedidos.filter((p) => p.estado === 'en_revision').length;
  const parciales = pedidos.filter((p) => p.estado === 'procesado_parcial' && !(porPedido.get(p.id) ?? []).every((d) => d.remanente_derivado_en || d.unidades_pendientes === 0)).length;

  const atender = useMemo(
    () => clientesPorAtender(actividadDeClientes(clientes, ultimaCompraPorCliente(compras), ultimoPedidoPorCliente(pedidos))),
    [clientes, compras, pedidos]
  );
  const recientes = useMemo(() => [...pedidos].filter(cuenta).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5), [pedidos]);
  const antiguos = useMemo(
    () => pedidos.filter((p) => perteneceAGrupo(p.estado, 'por_procesar') || p.estado === 'en_revision').sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, 5),
    [pedidos]
  );
  // Metas del mes: el avance usa todos los pedidos visibles (una meta de farmacia cuenta los de cualquier representante).
  const avances = useMemo(
    () => metas.map((m) => ({ m, a: avanceMeta(m, todos, unidades), texto: describirMeta(m, nombres) })).sort((x, y) => x.a.pct - y.a.pct),
    [metas, todos, unidades, nombres]
  );

  const mesAnterior = 'el mes pasado';
  const tomarPedido = (usuario.rol === 'vendedor' || esAdmin) && (
    <Boton variante="primario" icono={ClipboardPlus} onClick={() => irATab('captura')}>
      Tomar pedido
    </Boton>
  );
  const verTodos = (tab: string, texto = 'Ver todos') => (
    <button type="button" onClick={() => irATab(tab)} className="text-xs font-medium text-marca-700 hover:underline dark:text-marca-300">{texto}</button>
  );

  const selectorMetrica = <Segmentado valor={metrica} onChange={(v) => setMetrica(v as Metrica)} opciones={METRICAS} />;

  const grafico30 = (
    <Tarjeta className="lg:col-span-2">
      {total30 > 0 ? (
        <>
          {selectorMetrica}
          <Columnas puntos={serie} unidad={metrica} titulo={`${TITULO_METRICA[metrica]} por día · últimos 30 días`} />
        </>
      ) : (
        <>
          <Subtitulo>Pedidos por día</Subtitulo>
          <Vacio icono={CalendarDays} titulo="Sin pedidos en los últimos 30 días" texto={esVendedor ? 'Cuando tomes pedidos verás aquí tu ritmo diario.' : 'Aquí verás el ritmo diario de pedidos del equipo.'} accion={tomarPedido || undefined} />
        </>
      )}
    </Tarjeta>
  );

  const graficoMeses = (
    <Tarjeta className="lg:col-span-2">
      <Columnas puntos={serieMes} unidad={metrica} titulo={`${TITULO_METRICA[metrica]} por mes${mensualNube ? '' : ' · con los datos del dispositivo'}`} />
    </Tarjeta>
  );

  const tarjetaMetas = (
    <Tarjeta>
      <Subtitulo accion={puedeMetas ? verTodos('metas', avances.length ? 'Ver todas' : 'Definir') : undefined}>{esVendedor ? 'Mis metas del mes' : 'Metas del mes'}</Subtitulo>
      {avances.length === 0 ? (
        <Vacio icono={Target} titulo="Sin metas este mes" texto={puedeMetas ? 'Define objetivos por representante, farmacia o droguería.' : 'Tu gerente aún no definió metas para este mes.'} />
      ) : (
        <ul className="flex flex-col gap-4">
          {avances.slice(0, 4).map(({ m, a, texto }) => {
            const ind = indicador(m.indicador);
            return (
              <li key={m.id}>
                <Medidor
                  valor={a.valor}
                  total={a.objetivo}
                  rotulo={`${esVendedor && m.vendedor_id === usuario.id && !m.cliente_id && !m.drogueria_id ? ind.texto : `${texto} · ${ind.texto.toLowerCase()}`}`}
                  nota={a.valor >= a.objetivo ? '¡Meta cumplida!' : `Faltan ${formato(a.objetivo - a.valor)} · ${formato(a.porDia)} ${ind.unidad} por día${a.proyeccion !== null ? ` · proyección ${formato(a.proyeccion)}` : ''}`}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Tarjeta>
  );

  const ultimos = (
    <Tarjeta>
      <Subtitulo accion={verTodos('pedidos')}>{esVendedor ? 'Mis últimos pedidos' : 'Últimos pedidos'}</Subtitulo>
      {recientes.length === 0 ? (
        <Vacio titulo="Aún no hay pedidos" />
      ) : (
        <ul className="-my-2 divide-y divide-slate-100 dark:divide-slate-800">
          {recientes.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{nombreCliente.get(p.cliente_id) ?? 'Farmacia'}</p>
                <p className="text-xs text-slate-500">{p.correlativo} · {formato(unidadesDePedido(porPedido.get(p.id) ?? []).solicitadas)} uds</p>
              </div>
              <Etiqueta tono={ESTADOS_ETIQUETA[p.estado].tono}>{ESTADOS_ETIQUETA[p.estado].texto}</Etiqueta>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );

  const masPedidos = (
    <Tarjeta>
      <Subtitulo>Productos más pedidos del mes</Subtitulo>
      <BarrasRanking filas={topProductos} unidad="unidades" vacio="Aún no hay pedidos este mes." />
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
      />
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
        <Mini rotulo="Unidades por pedido" valor={resumen.actual.pedidos ? formato(Math.round(resumen.actual.unidades / resumen.actual.pedidos)) : '—'} />
        <Mini rotulo="Farmacias en fichero" valor={formato(clientes.length)} />
      </dl>
    </Tarjeta>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        titulo={`${saludo()}, ${usuario.nombre_completo.split(' ')[0]}`}
        descripcion={esVendedor ? 'Así va tu mes.' : 'Así va el mes del equipo.'}
        acciones={tomarPedido}
      />

      {avisos.length > 0 && esVendedor && (
        <button
          type="button"
          onClick={() => irATab('pedidos')}
          className="flex w-full items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-left text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">{avisos[0].titulo}{avisos.length > 1 ? ` (+${avisos.length - 1} más)` : ''}</span>
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Dato icono={ShoppingBag} rotulo="Pedidos del mes" valor={formato(resumen.actual.pedidos)} nota={<Variacion pct={variacion(resumen.actual.pedidos, resumen.anterior.pedidos)} periodo={mesAnterior} />} />
        <Dato icono={Package} rotulo="Unidades del mes" valor={formato(resumen.actual.unidades)} nota={<Variacion pct={variacion(resumen.actual.unidades, resumen.anterior.unidades)} periodo={mesAnterior} />} />
        <Dato icono={Activity} rotulo="Promedio por día" valor={`${formato(promDiaUnidades)} uds`} nota={`${promDiaPedidos.toLocaleString('es-VE', { maximumFractionDigits: 1 })} pedidos por día`} />
        <Dato icono={Store} rotulo="Farmacias con pedido hoy" valor={formato(resumen.hoy.clientes)} nota={`${formato(resumen.actual.clientes)} en el mes · ${formato(resumen.hoy.pedidos)} pedido${resumen.hoy.pedidos === 1 ? '' : 's'} hoy`} />
        <Dato icono={CalendarRange} rotulo="Promedio por mes" valor={promedioMensual === null ? '—' : `${formato(promedioMensual)} uds`} nota={cerrados.length ? `Últimos ${cerrados.length} mes${cerrados.length === 1 ? '' : 'es'} cerrados` : 'Aún sin meses cerrados'} />
        {esVendedor ? (
          pendientes > 0 ? (
            <Dato icono={Clock} rotulo="Por enviar" valor={pendientes} tono={errores > 0 ? 'peligro' : 'aviso'} nota={errores > 0 ? 'Hay pedidos con error' : 'Se envían al tener señal'} />
          ) : (
            <Dato icono={Users} rotulo="Clientes por atender" valor={atender.length} tono={atender.length > 0 ? 'aviso' : undefined} nota="Atrasados en su compra" />
          )
        ) : (
          <Dato icono={Clock} rotulo="Por procesar" valor={porProcesar} tono={porProcesar > 0 ? 'aviso' : undefined} nota={`${enRevision} en revisión${parciales ? ` · ${parciales} parciales` : ''}`} />
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

      <Fila>
        {grafico30}
        {tarjetaMetas}
      </Fila>

      {esVendedor ? (
        <>
          <Fila>
            {graficoMeses}
            {miFichero}
          </Fila>
          <Fila>
            <Tarjeta>
              <Subtitulo>Clientes por atender</Subtitulo>
              {atender.length === 0 ? (
                <Vacio titulo="Todo al día" texto="Ningún cliente de tu fichero está atrasado." />
              ) : (
                <ul className="-my-2 divide-y divide-slate-100 dark:divide-slate-800">
                  {atender.slice(0, 5).map((a) => (
                    <li key={a.cliente.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{a.cliente.nombre_comercial}</p>
                        <p className="text-xs text-slate-500">{a.dias} días sin comprar · cada {a.cliente.frecuencia_dias}</p>
                      </div>
                      <Boton tamano="sm" variante="secundario" onClick={() => { prepararPedidoPara(a.cliente.id); irATab('captura'); }}>
                        Pedido
                      </Boton>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
            {masPedidos}
            {ultimos}
          </Fila>
        </>
      ) : (
        <>
          <Fila>
            {graficoMeses}
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
                      <Etiqueta tono={ESTADOS_ETIQUETA[p.estado].tono}>{ESTADOS_ETIQUETA[p.estado].texto}</Etiqueta>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
          </Fila>
          <Fila>
            <Tarjeta>
              <Subtitulo>Unidades por representante · este mes</Subtitulo>
              <BarrasRanking filas={porVendedor} unidad="unidades" vacio="Aún no hay pedidos este mes." />
            </Tarjeta>
            {masPedidos}
            <Tarjeta>
              <Subtitulo>Unidades por droguería · este mes</Subtitulo>
              <BarrasRanking filas={porDrogueria} unidad="unidades" vacio="Aún no hay pedidos este mes." />
            </Tarjeta>
          </Fila>
          {ultimos}
        </>
      )}
    </div>
  );
}

const Fila = ({ children }: { children: ReactNode }) => <div className="grid gap-4 lg:grid-cols-3">{children}</div>;

function Mini({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{rotulo}</dt>
      <dd className="text-lg font-semibold text-slate-900 dark:text-white">{valor}</dd>
    </div>
  );
}
