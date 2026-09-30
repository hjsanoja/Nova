import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, ClipboardPlus, Link2, UserCheck } from 'lucide-react';
import type { Usuario } from '../types/pharmacy';
import { obtenerDb } from '../offline/db';
import { useLive } from '../offline/useLive';
import { useEstadoSync } from '../offline/syncStore';
import { getSupabaseClient } from '../services/supabaseClient';
import { Boton, Dato, Etiqueta, PageHeader, Tarjeta, Vacio } from '../components/ui/kit';
import type { LocalNotificacion } from '../offline/types';
import { actividadDeClientes, clientesPorAtender, ESTADOS_ETIQUETA, perteneceAGrupo, unidadesDePedido, detallesPorPedido } from './logica';
import { irASeccion, prepararPedidoPara } from './navegacion';
import { ultimaCompraPorCliente, ultimoPedidoPorCliente, useClientes, useCompras, useDetalles, usePedidos } from './useDatos';

const saludo = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
};
const esHoy = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

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
  const todos = usePedidos();
  const detalles = useDetalles();
  const compras = useCompras();
  const avisos = useLive(() => db.notificaciones.filter((n) => !n.leida).toArray(), [], [] as LocalNotificacion[]);
  const conteos = useConteosAdmin(esAdmin);

  const pedidos = useMemo(() => (esVendedor ? todos.filter((p) => p.vendedor_id === usuario.id) : todos), [todos, esVendedor, usuario.id]);
  const nombreCliente = useMemo(() => new Map(clientes.map((c) => [c.id, c.nombre_comercial])), [clientes]);
  const porPedido = useMemo(() => detallesPorPedido(detalles), [detalles]);

  const hoy = pedidos.filter((p) => esHoy(p.created_at) && p.estado !== 'borrador').length;
  const porProcesar = pedidos.filter((p) => perteneceAGrupo(p.estado, 'por_procesar')).length;
  const enRevision = pedidos.filter((p) => p.estado === 'en_revision').length;
  const parciales = pedidos.filter((p) => p.estado === 'procesado_parcial' && !(porPedido.get(p.id) ?? []).every((d) => d.remanente_derivado_en || d.unidades_pendientes === 0)).length;

  const atender = useMemo(
    () => clientesPorAtender(actividadDeClientes(clientes, ultimaCompraPorCliente(compras), ultimoPedidoPorCliente(pedidos))),
    [clientes, compras, pedidos]
  );
  const recientes = useMemo(() => [...pedidos].filter((p) => p.estado !== 'borrador').sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6), [pedidos]);
  const antiguos = useMemo(
    () => pedidos.filter((p) => perteneceAGrupo(p.estado, 'por_procesar') || p.estado === 'en_revision').sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, 5),
    [pedidos]
  );

  return (
    <div>
      <PageHeader
        titulo={`${saludo()}, ${usuario.nombre_completo.split(' ')[0]}`}
        descripcion={esVendedor ? 'Tu día de un vistazo.' : 'Estado de los pedidos ahora mismo.'}
        acciones={
          (usuario.rol === 'vendedor' || esAdmin) && (
            <Boton variante="primario" icono={ClipboardPlus} onClick={() => irATab('captura')}>
              Tomar pedido
            </Boton>
          )
        }
      />

      {avisos.length > 0 && esVendedor && (
        <button
          type="button"
          onClick={() => irATab('pedidos')}
          className="mb-3 flex w-full items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-left text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{avisos[0].titulo}{avisos.length > 1 ? ` (+${avisos.length - 1} más)` : ''}</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Dato rotulo="Pedidos hoy" valor={hoy} />
        {esVendedor ? <Dato rotulo="Por enviar" valor={pendientes} tono={errores > 0 ? 'rojo' : pendientes > 0 ? 'ambar' : undefined} /> : <Dato rotulo="Por procesar" valor={porProcesar} tono={porProcesar > 0 ? 'ambar' : undefined} />}
        <Dato rotulo="En revisión" valor={enRevision} tono={enRevision > 0 ? 'ambar' : undefined} />
        <Dato rotulo={esVendedor ? 'Clientes por atender' : 'Parciales por re-rutear'} valor={esVendedor ? atender.length : parciales} tono={(esVendedor ? atender.length : parciales) > 0 ? 'ambar' : undefined} />
      </div>

      {esAdmin && conteos && (conteos.cuentas > 0 || conteos.farmacias > 0 || conteos.productos > 0) && (
        <Tarjeta className="mb-3">
          <p className="mb-2 text-sm font-bold">Pendiente de tu parte</p>
          <div className="flex flex-wrap gap-2">
            {conteos.cuentas > 0 && (
              <Boton icono={UserCheck} onClick={() => irASeccion(irATab, 'config', 'usuarios')}>
                {conteos.cuentas} cuenta{conteos.cuentas === 1 ? '' : 's'} por activar
              </Boton>
            )}
            {(conteos.farmacias > 0 || conteos.productos > 0) && (
              <Boton icono={Link2} onClick={() => irASeccion(irATab, 'datos', 'pendientes')}>
                {conteos.farmacias} farmacias y {conteos.productos} productos sin homologar
              </Boton>
            )}
          </div>
        </Tarjeta>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {esVendedor ? (
          <Tarjeta>
            <p className="mb-1 text-sm font-bold">Clientes por atender</p>
            <p className="mb-2 text-xs text-slate-500">Llevan más días sin comprar que su frecuencia habitual.</p>
            {atender.length === 0 ? (
              <Vacio titulo="Todo al día" texto="Ningún cliente de tu fichero está atrasado." />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {atender.map((a) => (
                  <li key={a.cliente.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{a.cliente.nombre_comercial}</p>
                      <p className="text-xs text-slate-500">
                        {a.dias} días sin comprar · cada {a.cliente.frecuencia_dias} días
                      </p>
                    </div>
                    <Boton variante="suave" onClick={() => { prepararPedidoPara(a.cliente.id); irATab('captura'); }}>
                      Pedido
                    </Boton>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        ) : (
          <Tarjeta>
            <p className="mb-1 text-sm font-bold">Esperando más tiempo</p>
            <p className="mb-2 text-xs text-slate-500">Pedidos por procesar o en revisión, los más antiguos primero.</p>
            {antiguos.length === 0 ? (
              <Vacio titulo="Sin pedidos en espera" />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {antiguos.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{p.correlativo} · {nombreCliente.get(p.cliente_id) ?? 'Farmacia'}</p>
                      <p className="text-xs text-slate-500">{new Date(p.created_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</p>
                    </div>
                    <Etiqueta tono={ESTADOS_ETIQUETA[p.estado].tono}>{ESTADOS_ETIQUETA[p.estado].texto}</Etiqueta>
                  </li>
                ))}
              </ul>
            )}
            {(usuario.rol === 'admin' || usuario.rol === 'teletransferencista') && antiguos.length > 0 && (
              <Boton variante="suave" className="mt-2" onClick={() => irATab('por_procesar')}>Ir a procesar</Boton>
            )}
          </Tarjeta>
        )}

        <Tarjeta>
          <p className="mb-2 text-sm font-bold">{esVendedor ? 'Mis últimos pedidos' : 'Últimos pedidos'}</p>
          {recientes.length === 0 ? (
            <Vacio titulo="Aún no hay pedidos" texto={esVendedor ? 'Toma el primero con el botón "Tomar pedido".' : undefined} />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {recientes.map((p) => {
                const u = unidadesDePedido(porPedido.get(p.id) ?? []);
                return (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{nombreCliente.get(p.cliente_id) ?? 'Farmacia'}</p>
                      <p className="text-xs text-slate-500">{p.correlativo} · {u.solicitadas} uds</p>
                    </div>
                    <Etiqueta tono={ESTADOS_ETIQUETA[p.estado].tono}>{ESTADOS_ETIQUETA[p.estado].texto}</Etiqueta>
                  </li>
                );
              })}
            </ul>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
