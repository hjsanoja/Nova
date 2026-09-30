import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarDays, ClipboardPlus, Clock, Link2, Package, ShoppingBag, UserCheck, Users } from 'lucide-react';
import type { Usuario } from '../types/pharmacy';
import { obtenerDb } from '../offline/db';
import { useLive } from '../offline/useLive';
import { useEstadoSync } from '../offline/syncStore';
import { getSupabaseClient } from '../services/supabaseClient';
import { Boton, Dato, Etiqueta, PageHeader, Subtitulo, Tarjeta, Vacio, Variacion } from '../components/ui/kit';
import { BarrasRanking, Columnas, Medidor } from '../components/graficos/Graficos';
import type { LocalNotificacion } from '../offline/types';
import { actividadDeClientes, clientesPorAtender, ESTADOS_ETIQUETA, perteneceAGrupo, unidadesDePedido, detallesPorPedido } from './logica';
import { irASeccion, prepararPedidoPara } from './navegacion';
import { cuenta, rankingMes, resumenMeses, serieDiaria, topProductosMes, unidadesPorPedido, variacion } from './indicadores';
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
  const { pendientes, errores } = useEstadoSync();
  const clientes = useClientes();
  const productos = useProductos();
  const droguerias = useDroguerias();
  const todos = usePedidos();
  const detalles = useDetalles();
  const compras = useCompras();
  const { usuarios } = useUsuariosNube();
  const avisos = useLive(() => db.notificaciones.filter((n) => !n.leida).toArray(), [], [] as LocalNotificacion[]);
  const conteos = useConteosAdmin(esAdmin);

  const pedidos = useMemo(() => (esVendedor ? todos.filter((p) => p.vendedor_id === usuario.id) : todos), [todos, esVendedor, usuario.id]);
  const nombreCliente = useMemo(() => new Map(clientes.map((c) => [c.id, c.nombre_comercial])), [clientes]);
  const porPedido = useMemo(() => detallesPorPedido(detalles), [detalles]);
  const unidades = useMemo(() => unidadesPorPedido(detalles), [detalles]);

  // Indicadores del mes y de los últimos 30 días.
  const resumen = useMemo(() => resumenMeses(pedidos, unidades), [pedidos, unidades]);
  const serie = useMemo(() => serieDiaria(pedidos, unidades, 30).map((p) => ({ clave: p.fecha, etiqueta: etiquetaDia(p.fecha), valor: p.unidades })), [pedidos, unidades]);
  const total30 = serie.reduce((a, p) => a + p.valor, 0);
  const topProductos = useMemo(() => {
    const nombre = new Map(productos.map((p) => [p.id, p.nombre_comercial]));
    return topProductosMes(pedidos, detalles, (id) => nombre.get(id) ?? 'Producto', 5);
  }, [pedidos, detalles, productos]);
  const porVendedor = useMemo(() => {
    const nombre = new Map(usuarios.map((u) => [u.id, u.nombre_completo]));
    return rankingMes(pedidos, unidades, (p) => p.vendedor_id, (k) => nombre.get(k) ?? 'Vendedor', 5);
  }, [pedidos, unidades, usuarios]);
  const porDrogueria = useMemo(() => {
    const nombre = new Map(droguerias.map((d) => [d.id, d.nombre]));
    return rankingMes(pedidos, unidades, (p) => p.drogueria_id, (k) => nombre.get(k) ?? 'Droguería', 5);
  }, [pedidos, unidades, droguerias]);

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

  const mesAnterior = 'el mes pasado';
  const tomarPedido = (usuario.rol === 'vendedor' || esAdmin) && (
    <Boton variante="primario" icono={ClipboardPlus} onClick={() => irATab('captura')}>
      Tomar pedido
    </Boton>
  );

  const grafico30 = (
    <Tarjeta className="lg:col-span-2">
      {total30 > 0 ? (
        <Columnas puntos={serie} unidad="unidades" titulo="Unidades pedidas por día · últimos 30 días" />
      ) : (
        <>
          <Subtitulo>Unidades pedidas por día</Subtitulo>
          <Vacio icono={CalendarDays} titulo="Sin pedidos en los últimos 30 días" texto={esVendedor ? 'Cuando tomes pedidos verás aquí tu ritmo diario.' : 'Aquí verás el ritmo diario de pedidos del equipo.'} accion={tomarPedido || undefined} />
        </>
      )}
    </Tarjeta>
  );

  const ultimos = (
    <Tarjeta>
      <Subtitulo accion={<button type="button" onClick={() => irATab('pedidos')} className="text-xs font-medium text-marca-700 hover:underline dark:text-marca-300">Ver todos</button>}>
        {esVendedor ? 'Mis últimos pedidos' : 'Últimos pedidos'}
      </Subtitulo>
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Dato icono={Package} rotulo="Unidades del mes" valor={formato(resumen.actual.unidades)} nota={<Variacion pct={variacion(resumen.actual.unidades, resumen.anterior.unidades)} periodo={mesAnterior} />} />
        <Dato icono={ShoppingBag} rotulo="Pedidos del mes" valor={formato(resumen.actual.pedidos)} nota={<Variacion pct={variacion(resumen.actual.pedidos, resumen.anterior.pedidos)} periodo={mesAnterior} />} />
        <Dato icono={CalendarDays} rotulo="Pedidos hoy" valor={formato(resumen.hoy.pedidos)} nota={`${formato(resumen.hoy.unidades)} unidad${resumen.hoy.unidades === 1 ? '' : 'es'}`} />
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

      {esVendedor ? (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            {grafico30}
            <Tarjeta>
              <Subtitulo>Mi fichero este mes</Subtitulo>
              <Medidor
                valor={resumen.actual.clientes}
                total={clientes.length}
                rotulo="Clientes con pedido"
                nota={clientes.length === 0 ? 'Agrega farmacias a tu fichero desde "Mis clientes".' : `${formato(Math.max(0, clientes.length - resumen.actual.clientes))} farmacias sin pedido este mes.`}
              />
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                <div>
                  <dt className="text-xs text-slate-500">Unidades por pedido</dt>
                  <dd className="text-lg font-semibold text-slate-900 dark:text-white">{resumen.actual.pedidos ? formato(Math.round(resumen.actual.unidades / resumen.actual.pedidos)) : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Farmacias en fichero</dt>
                  <dd className="text-lg font-semibold text-slate-900 dark:text-white">{formato(clientes.length)}</dd>
                </div>
              </dl>
            </Tarjeta>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
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
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            {grafico30}
            <Tarjeta>
              <Subtitulo accion={(esAdmin || usuario.rol === 'teletransferencista') && antiguos.length > 0 ? <button type="button" onClick={() => irATab('por_procesar')} className="text-xs font-medium text-marca-700 hover:underline dark:text-marca-300">Ir a procesar</button> : undefined}>
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
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Tarjeta>
              <Subtitulo>Unidades por vendedor · este mes</Subtitulo>
              <BarrasRanking filas={porVendedor} unidad="unidades" vacio="Aún no hay pedidos este mes." />
            </Tarjeta>
            {masPedidos}
            <Tarjeta>
              <Subtitulo>Unidades por droguería · este mes</Subtitulo>
              <BarrasRanking filas={porDrogueria} unidad="unidades" vacio="Aún no hay pedidos este mes." />
            </Tarjeta>
          </div>
          {ultimos}
        </>
      )}
    </div>
  );
}
