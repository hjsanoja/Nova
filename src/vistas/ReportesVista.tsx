import { useEffect, useMemo, useState } from 'react';
import { BellRing, Download, RefreshCw } from 'lucide-react';
import type { Usuario } from '../types/pharmacy';
import { getSupabaseClient } from '../services/supabaseClient';
import { Boton, Etiqueta, PageHeader, Segmentado, Tarjeta, Vacio, estiloInput, useAviso } from '../components/ui/kit';
import { aCsv, cumplimientoPorDrogueria, descargarTexto, detallesPorPedido, ESTADOS_ETIQUETA, filtrarPedidos, GRUPOS_ESTADO, MS_DIA, unidadesDePedido } from './logica';
import type { GrupoEstado } from './logica';
import { useClientes, useDetalles, useDroguerias, usePedidos, useProductos, useUsuariosNube } from './useDatos';

type Seccion = 'pedidos' | 'cumplimiento' | 'alertas';

/** Reportes para gerencia y administración: pedidos con filtros, cumplimiento de las droguerías y alertas comerciales. */
export function ReportesVista({ usuario }: { usuario: Usuario }) {
  const [seccion, setSeccion] = useState<Seccion>('pedidos');
  return (
    <div>
      <PageHeader titulo="Reportes" descripcion="Se calculan con los pedidos de los últimos 90 días." />
      <Segmentado opciones={[{ id: 'pedidos', texto: 'Pedidos' }, { id: 'cumplimiento', texto: 'Cumplimiento' }, { id: 'alertas', texto: 'Alertas' }]} valor={seccion} onChange={setSeccion} />
      {seccion === 'pedidos' && <ReportePedidos />}
      {seccion === 'cumplimiento' && <Cumplimiento />}
      {seccion === 'alertas' && <Alertas esAdmin={usuario.rol === 'admin'} />}
    </div>
  );
}

function ReportePedidos() {
  const pedidos = usePedidos();
  const detalles = useDetalles();
  const clientes = useClientes();
  const droguerias = useDroguerias();
  const { usuarios } = useUsuariosNube();
  const [dias, setDias] = useState(30);
  const [grupo, setGrupo] = useState<GrupoEstado>('todos');
  const [drogueria, setDrogueria] = useState('');
  const [vendedor, setVendedor] = useState('');

  const nombreCliente = useMemo(() => {
    const m = new Map(clientes.map((c) => [c.id, c.nombre_comercial]));
    return (id: string) => m.get(id) ?? '';
  }, [clientes]);
  const porPedido = useMemo(() => detallesPorPedido(detalles), [detalles]);
  const lista = useMemo(
    () => filtrarPedidos(pedidos, { grupo, texto: '', drogueriaId: drogueria || null, vendedorId: vendedor || null, desde: Date.now() - dias * MS_DIA }, nombreCliente),
    [pedidos, grupo, drogueria, vendedor, dias, nombreCliente]
  );
  const total = useMemo(() => lista.reduce((a, p) => a + unidadesDePedido(porPedido.get(p.id) ?? []).solicitadas, 0), [lista, porPedido]);
  const nombreVend = (id: string) => usuarios.find((u) => u.id === id)?.nombre_completo ?? id.slice(0, 8);
  const vendedores = useMemo(() => Array.from(new Set(pedidos.map((p) => p.vendedor_id))), [pedidos]);

  const exportar = () =>
    descargarTexto(
      `pedidos_${new Date().toISOString().slice(0, 10)}.csv`,
      aCsv(
        ['Pedido', 'Fecha', 'Farmacia', 'Droguería', 'Vendedor', 'Estado', 'Unidades pedidas', 'Unidades confirmadas'],
        lista.map((p) => {
          const u = unidadesDePedido(porPedido.get(p.id) ?? []);
          return [p.correlativo, p.created_at.slice(0, 10), nombreCliente(p.cliente_id), droguerias.find((d) => d.id === p.drogueria_id)?.nombre, nombreVend(p.vendedor_id), ESTADOS_ETIQUETA[p.estado].texto, u.solicitadas, u.confirmadas];
        })
      )
    );

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Periodo" className={`${estiloInput} w-auto`}>
          <option value={7}>Últimos 7 días</option><option value={30}>Últimos 30 días</option><option value={90}>Últimos 90 días</option>
        </select>
        <select value={grupo} onChange={(e) => setGrupo(e.target.value as GrupoEstado)} aria-label="Estado" className={`${estiloInput} w-auto`}>
          {GRUPOS_ESTADO.map((g) => <option key={g.id} value={g.id}>{g.id === 'todos' ? 'Todos los estados' : g.texto}</option>)}
        </select>
        <select value={drogueria} onChange={(e) => setDrogueria(e.target.value)} aria-label="Droguería" className={`${estiloInput} w-auto`}>
          <option value="">Todas las droguerías</option>{droguerias.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select>
        <select value={vendedor} onChange={(e) => setVendedor(e.target.value)} aria-label="Vendedor" className={`${estiloInput} w-auto`}>
          <option value="">Todos los vendedores</option>{vendedores.map((v) => <option key={v} value={v}>{nombreVend(v)}</option>)}
        </select>
        <Boton icono={Download} onClick={exportar} disabled={lista.length === 0}>Descargar CSV</Boton>
      </div>
      <p className="mb-2 text-xs text-slate-500">{lista.length} pedido{lista.length === 1 ? '' : 's'} · {total.toLocaleString('es')} unidades pedidas</p>
      <Tarjeta className="!p-0">
        {lista.length === 0 ? <Vacio titulo="Sin pedidos con estos filtros" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/60"><tr><th className="px-3 py-2">Pedido</th><th>Fecha</th><th>Farmacia</th><th>Droguería</th><th>Vendedor</th><th>Estado</th><th className="pr-3 text-right">Uds</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {lista.slice(0, 300).map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap px-3 py-1.5 font-semibold">{p.correlativo}</td>
                    <td className="whitespace-nowrap">{p.created_at.slice(0, 10)}</td>
                    <td className="max-w-48 truncate">{nombreCliente(p.cliente_id)}</td>
                    <td>{droguerias.find((d) => d.id === p.drogueria_id)?.nombre}</td>
                    <td className="max-w-32 truncate">{nombreVend(p.vendedor_id)}</td>
                    <td><Etiqueta tono={ESTADOS_ETIQUETA[p.estado].tono}>{ESTADOS_ETIQUETA[p.estado].texto}</Etiqueta></td>
                    <td className="pr-3 text-right">{unidadesDePedido(porPedido.get(p.id) ?? []).solicitadas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </>
  );
}

function Cumplimiento() {
  const pedidos = usePedidos();
  const detalles = useDetalles();
  const droguerias = useDroguerias();
  const filas = useMemo(() => cumplimientoPorDrogueria(pedidos, detalles, droguerias), [pedidos, detalles, droguerias]);
  return (
    <>
      <p className="mb-2 text-xs text-slate-500">Qué porcentaje de lo pedido confirma cada droguería (solo pedidos ya procesados).</p>
      <Tarjeta className="!p-0">
        {filas.length === 0 ? <Vacio titulo="Todavía no hay pedidos procesados" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800/60"><tr><th className="px-3 py-2">Droguería</th><th className="text-right">Pedidos</th><th className="text-right">Pedidas</th><th className="text-right">Confirmadas</th><th className="text-right">Quiebres</th><th className="pr-3 text-right">Cumplimiento</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filas.map((f) => (
                  <tr key={f.drogueriaId}>
                    <td className="px-3 py-2 font-semibold">{f.drogueria}</td><td className="text-right">{f.pedidos}</td><td className="text-right">{f.solicitadas}</td><td className="text-right">{f.confirmadas}</td><td className="text-right">{f.quiebres}</td>
                    <td className="pr-3 text-right"><Etiqueta tono={f.fillRate == null ? 'gris' : f.fillRate >= 95 ? 'verde' : f.fillRate >= 80 ? 'ambar' : 'rojo'}>{f.fillRate == null ? '—' : `${f.fillRate}%`}</Etiqueta></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </>
  );
}

interface Alerta { id: string; tipo: string; severidad: number; cliente_id: string | null; producto_id: string | null; territorio: string | null; detalle: Record<string, number | string> }

function Alertas({ esAdmin }: { esAdmin: boolean }) {
  const clientes = useClientes();
  const productos = useProductos();
  const [alertas, setAlertas] = useState<Alerta[] | null>(null);
  const [error, setError] = useState('');
  const [recarga, setRecarga] = useState(0);
  const [calculando, setCalculando] = useState(false);
  const { mostrar, nodo } = useAviso();

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return setAlertas([]);
    let vivo = true;
    void sb.from('alertas_comerciales').select('id,tipo,severidad,cliente_id,producto_id,territorio,detalle').is('resuelta_en', null).order('severidad', { ascending: false }).limit(200).then(({ data, error: e }) => {
      if (!vivo) return;
      if (e) setError(e.message);
      else setAlertas((data ?? []) as Alerta[]);
    });
    return () => { vivo = false; };
  }, [recarga]);

  const recalcular = async () => {
    const sb = getSupabaseClient();
    if (!sb) return;
    setCalculando(true);
    const a = await sb.rpc('recalcular_segmentos_clientes');
    const b = await sb.rpc('generar_alertas_comerciales');
    setCalculando(false);
    if (a.error || b.error) mostrar({ tipo: 'error', texto: (a.error ?? b.error)!.message });
    else { mostrar({ tipo: 'ok', texto: 'Alertas y segmentos recalculados.' }); setRecarga((n) => n + 1); }
  };

  const nombre = (a: Alerta) => {
    const c = clientes.find((x) => x.id === a.cliente_id)?.nombre_comercial;
    const p = productos.find((x) => x.id === a.producto_id)?.nombre_comercial;
    return a.tipo === 'churn_riesgo' ? c ?? 'Farmacia' : `${p ?? 'Producto'}${a.territorio ? ` en ${a.territorio}` : ''}`;
  };
  const texto = (a: Alerta) => (a.tipo === 'churn_riesgo' ? `${a.detalle.dias_sin_pedido} días sin comprar (su ciclo es de ${a.detalle.frecuencia_dias})` : a.detalle.dias_sin_colocar ? `Sin colocarse hace ${a.detalle.dias_sin_colocar} días` : 'Nunca se ha colocado');

  return (
    <>
      {nodo}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">Farmacias en riesgo de abandono y productos que no se están colocando.</p>
        {esAdmin && <Boton icono={RefreshCw} onClick={recalcular} disabled={calculando}>{calculando ? 'Calculando…' : 'Recalcular ahora'}</Boton>}
      </div>
      <Tarjeta className="!p-0">
        {error ? <Vacio titulo="No se pudieron cargar las alertas" texto={error} /> : alertas === null ? <Vacio titulo="Cargando…" /> : alertas.length === 0 ? (
          <Vacio icono={BellRing} titulo="Sin alertas" texto="Las alertas se generan a diario; un administrador también puede recalcularlas." />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {alertas.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{nombre(a)}</p><p className="text-xs text-slate-500">{texto(a)}</p></div>
                <div className="flex shrink-0 gap-1.5"><Etiqueta tono={a.tipo === 'churn_riesgo' ? 'rojo' : 'ambar'}>{a.tipo === 'churn_riesgo' ? 'Abandono' : 'SKU hueso'}</Etiqueta>{a.severidad >= 3 && <Etiqueta tono="rojo">Urgente</Etiqueta>}</div>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </>
  );
}
