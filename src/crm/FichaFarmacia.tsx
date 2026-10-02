import { useMemo, useState } from 'react';
import { ClipboardPlus, MapPin, MapPinCheck, Phone, UserMinus } from 'lucide-react';
import { Boton, Etiqueta, Segmentado } from '../components/ui/kit';
import type { LocalCliente, LocalCompraMensual, LocalMedico, LocalPedido, LocalProducto, LocalTarea, LocalVisita } from '../offline/types';
import { ESTADOS_ETIQUETA, diasDesde } from '../vistas/logica';
import { NIVELES_RIESGO, describirRiesgo } from '../vistas/riesgo';
import type { FarmaciaRiesgo } from '../vistas/riesgo';
import { fechaCorta } from './datos';
import { HistorialRegistro, ListaVisitas } from './Historial';
import { TareasDe } from './Tareas';

type Pestana = 'resumen' | 'pedidos' | 'visitas' | 'tareas' | 'historial';
const enlace = 'inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800';

/** Productos que compraba (meses 3 a 6 atrás) y no aparecen en los 2 últimos meses con datos. */
export function dejoDeComprar(compras: Pick<LocalCompraMensual, 'producto_id' | 'periodo' | 'unidades'>[]): { producto_id: string; unidades: number }[] {
  const periodos = Array.from(new Set(compras.map((c) => c.periodo))).sort().reverse();
  if (periodos.length < 3) return [];
  const recientes = new Set(periodos.slice(0, 2));
  const antes = new Set(periodos.slice(2, 6));
  const ahora = new Set(compras.filter((c) => recientes.has(c.periodo)).map((c) => c.producto_id));
  const suma = new Map<string, number>();
  for (const c of compras) if (antes.has(c.periodo) && !ahora.has(c.producto_id)) suma.set(c.producto_id, (suma.get(c.producto_id) ?? 0) + c.unidades);
  return [...suma.entries()].map(([producto_id, unidades]) => ({ producto_id, unidades })).sort((a, b) => b.unidades - a.unidades).slice(0, 6);
}

/**
 * Ficha 360° de una farmacia: resumen (datos, riesgo, cuentas, lo que compra y lo que dejó de comprar), pedidos, visitas,
 * tareas y el historial de cambios (administración y gerencia).
 */
export function FichaFarmacia({
  cliente: c, riesgo, compras, pedidos, visitas, tareas, productos, clientes, medicos, cuentas, vendedorId, verHistorial, nombreUsuario,
  puedePedir, onPedido, onQuitar, onVisita,
}: {
  cliente: LocalCliente;
  riesgo?: FarmaciaRiesgo;
  compras: LocalCompraMensual[];
  pedidos: LocalPedido[];
  visitas: LocalVisita[];
  tareas: LocalTarea[];
  productos: LocalProducto[];
  clientes: LocalCliente[];
  medicos: LocalMedico[];
  cuentas: { drogueria: string; cuenta: string | null; nombre: string | null; principal: boolean }[];
  vendedorId: string;
  verHistorial: boolean;
  nombreUsuario: (id: string) => string;
  puedePedir: boolean;
  onPedido: () => void;
  /** Solo el vendedor, en su propio fichero. */
  onQuitar?: () => void;
  onVisita?: () => void;
}) {
  const [pestana, setPestana] = useState<Pestana>('resumen');
  const nombreProducto = useMemo(() => {
    const m = new Map(productos.map((p) => [p.id, p.nombre_comercial]));
    return (id: string) => m.get(id) ?? 'Producto';
  }, [productos]);
  // Lo que más compró en los últimos 3 meses con datos.
  const periodos = Array.from(new Set(compras.map((x) => x.periodo))).sort().reverse().slice(0, 3);
  const top = new Map<string, number>();
  compras.filter((x) => periodos.includes(x.periodo)).forEach((x) => top.set(x.producto_id, (top.get(x.producto_id) ?? 0) + x.unidades));
  const masComprados = [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const dejo = useMemo(() => dejoDeComprar(compras), [compras]);
  const mapa = c.lat != null && c.lon != null ? `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lon}` : null;
  const ordenados = [...pedidos].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const pendientes = tareas.filter((t) => t.estado === 'pendiente').length;
  const hoy = new Date();
  const hoyTexto = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-2">
        {puedePedir && <Boton variante="primario" icono={ClipboardPlus} onClick={onPedido}>Tomar pedido</Boton>}
        {onVisita && <Boton icono={MapPinCheck} onClick={onVisita}>Registrar visita</Boton>}
        {c.telefono && <a href={`tel:${c.telefono}`} className={enlace}><Phone className="h-4 w-4" aria-hidden />{c.telefono}</a>}
        {mapa && <a href={mapa} target="_blank" rel="noopener noreferrer" className={enlace}><MapPin className="h-4 w-4" aria-hidden />Cómo llegar</a>}
        {onQuitar && <Boton variante="fantasma" icono={UserMinus} onClick={onQuitar}>Quitar de mi fichero</Boton>}
      </div>

      <Segmentado
        valor={pestana}
        onChange={setPestana}
        opciones={[
          { id: 'resumen', texto: 'Resumen' },
          { id: 'pedidos', texto: 'Pedidos', cuenta: pedidos.length || undefined },
          { id: 'visitas', texto: 'Visitas', cuenta: visitas.length || undefined },
          { id: 'tareas', texto: 'Tareas', cuenta: pendientes || undefined },
          ...(verHistorial ? [{ id: 'historial' as const, texto: 'Historial' }] : []),
        ]}
      />

      {pestana === 'resumen' && (
        <div className="space-y-4">
          {riesgo && (
            <div className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 ${riesgo.nivel === 'al_dia' ? 'bg-slate-50 dark:bg-slate-800/60' : 'bg-amber-50 dark:bg-amber-950/30'}`}>
              <Etiqueta tono={NIVELES_RIESGO[riesgo.nivel].tono} punto>{NIVELES_RIESGO[riesgo.nivel].texto}</Etiqueta>
              <span className="text-xs text-slate-600 dark:text-slate-300">{describirRiesgo(riesgo)}{riesgo.cicloDeFicha ? ' (según su ficha)' : ''}</span>
            </div>
          )}
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              ['Pedidos (90 días)', String(pedidos.length)],
              ['Última visita', visitas.length ? fechaCorta([...visitas].sort((a, b) => b.checkin_en.localeCompare(a.checkin_en))[0].checkin_en) : '—'],
              ['Tareas pendientes', String(pendientes)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-slate-50 px-2 py-2 dark:bg-slate-800/60">
                <dt className="text-[11px] text-slate-500">{k}</dt>
                <dd className="text-base font-bold text-slate-900 dark:text-white">{v}</dd>
              </div>
            ))}
          </dl>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {[
              ['Código', c.codigo_interno], ['RIF', c.rif], ['Razón social', c.razon_social], ['Zona', c.brick],
              ['Municipio', c.municipio], ['Cadena', c.bandera], ['Frecuencia', c.frecuencia_dias ? `cada ${c.frecuencia_dias} días` : null], ['Dirección', c.direccion],
            ].filter(([, v]) => v).map(([k, v]) => (
              <div key={k as string} className="min-w-0">
                <dt className="text-slate-500">{k}</dt>
                <dd className="truncate font-semibold" title={v as string}>{v}</dd>
              </div>
            ))}
          </dl>
          {cuentas.length > 0 && (
            <section>
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Cuenta en cada droguería</h3>
              <ul className="space-y-1 text-xs">
                {cuentas.map((x, i) => (
                  <li key={i} className="flex justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/60">
                    <span className="font-semibold">{x.drogueria}{x.principal ? '' : ' (otra cuenta)'}</span>
                    <span className="truncate text-slate-600 dark:text-slate-300">{x.cuenta ?? x.nombre ?? '—'}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Lo que más compra (últimos meses)</h3>
            {masComprados.length === 0 ? (
              <p className="text-xs text-slate-500">Todavía no hay compras reportadas por las droguerías.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {masComprados.map(([id, u]) => (
                  <li key={id} className="flex justify-between gap-2"><span className="truncate">{nombreProducto(id)}</span><span className="font-semibold">{u} uds</span></li>
                ))}
              </ul>
            )}
          </section>
          {dejo.length > 0 && (
            <section>
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Dejó de comprar</h3>
              <p className="mb-1 text-xs text-slate-500">Los compraba antes y no aparecen en los 2 últimos meses: buena conversación para la próxima visita.</p>
              <ul className="space-y-1 text-xs">
                {dejo.map((d) => (
                  <li key={d.producto_id} className="flex justify-between gap-2"><span className="truncate">{nombreProducto(d.producto_id)}</span><span className="text-slate-500">{d.unidades} uds antes</span></li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {pestana === 'pedidos' && (
        ordenados.length === 0 ? (
          <p className="text-sm text-slate-500">Sin pedidos en NOVA en los últimos 90 días.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {ordenados.slice(0, 15).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                <span><span className="font-semibold">{p.correlativo}</span><span className="text-xs text-slate-500"> · hace {diasDesde(p.created_at) ?? 0} d</span></span>
                <Etiqueta tono={ESTADOS_ETIQUETA[p.estado].tono} punto>{ESTADOS_ETIQUETA[p.estado].texto}</Etiqueta>
              </li>
            ))}
          </ul>
        )
      )}

      {pestana === 'visitas' && <ListaVisitas visitas={visitas} productos={productos} nombreVendedor={nombreUsuario} />}

      {pestana === 'tareas' && (
        <TareasDe tareas={tareas} hoy={hoyTexto} vendedorId={vendedorId} destino={{ cliente_id: c.id, nombre: c.nombre_comercial }} clientes={clientes} medicos={medicos} />
      )}

      {pestana === 'historial' && verHistorial && <HistorialRegistro tabla="dim_clientes" registroId={c.id} nombreUsuario={nombreUsuario} />}
    </div>
  );
}
