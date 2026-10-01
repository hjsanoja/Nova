import { useMemo, useState } from 'react';
import { ClipboardPlus, MapPin, MapPinCheck, Phone, Plus, Search, UserMinus, Users } from 'lucide-react';
import type { Usuario } from '../types/pharmacy';
import type { LocalCliente } from '../offline/types';
import { Sheet } from '../components/capture/Sheet';
import { Boton, Etiqueta, PageHeader, Tarjeta, Vacio, estiloInput, useAviso, useDebounced } from '../components/ui/kit';
import { normalizar } from '../offline/busqueda';
import { actividadDeClientes, clientesPorAtender, ESTADOS_ETIQUETA, diasDesde } from './logica';
import { prepararPedidoPara } from './navegacion';
import { AgregarFarmacias } from './AgregarFarmacias';
import { getSupabaseClient } from '../services/supabaseClient';
import { cambiarMiFichero, refrescarFarmaciasDelDispositivo } from '../services/ficheroVendedor';
import { obtenerDb } from '../offline/db';
import { registrarVisitaLocal } from '../offline/pedidos';
import { solicitarSync } from '../offline/motor';
import { ultimaCompraPorCliente, ultimoPedidoPorCliente, useClientes, useCompras, useDroguerias, useMapClientes, usePedidos, useProductos } from './useDatos';

const POR_PAGINA = 60;

/** Fichero de farmacias. Un vendedor ve solo las suyas (lo decide la base de datos); la mesa y la gerencia ven todas. */
export function ClientesVista({ usuario, irATab }: { usuario: Usuario; irATab: (t: string) => void }) {
  const clientes = useClientes();
  const compras = useCompras();
  const pedidos = usePedidos();
  const productos = useProductos();
  const droguerias = useDroguerias();
  const mapClientes = useMapClientes();
  const [texto, setTexto] = useState('');
  const q = useDebounced(texto, 150);
  const [soloAtrasados, setSoloAtrasados] = useState(false);
  const [zona, setZona] = useState('');
  const [limite, setLimite] = useState(POR_PAGINA);
  const [abierto, setAbierto] = useState<string | null>(null);

  const esVendedor = usuario.rol === 'vendedor';
  // El vendedor arma su fichero (necesita la nube: en modo demostración no aplica).
  const puedeEditarFichero = esVendedor && !!getSupabaseClient();
  const [agregando, setAgregando] = useState(false);
  const { mostrar, nodo } = useAviso();
  // Visita (check-in): guarda la ubicación; el servidor calcula si estaba dentro del radio de la farmacia.
  const registrarVisita = (c: LocalCliente) => {
    const guardar = async (pos?: GeolocationPosition) => {
      await registrarVisitaLocal(obtenerDb(), { cliente_id: c.id, lat: pos?.coords.latitude, lon: pos?.coords.longitude, precision_gps_m: pos?.coords.accuracy }, { vendedor_id: usuario.id });
      solicitarSync();
      mostrar({ tipo: 'ok', texto: `Visita a ${c.nombre_comercial} registrada${pos ? '' : ' (sin ubicación)'}.` });
    };
    if (!navigator.geolocation) return void guardar();
    navigator.geolocation.getCurrentPosition((p) => void guardar(p), () => void guardar(), { enableHighAccuracy: true, timeout: 10000 });
  };
  const quitarDeMiFichero = async (c: LocalCliente) => {
    const sb = getSupabaseClient();
    if (!sb || !c.codigo_interno) return;
    if (!window.confirm(`¿Quitar ${c.nombre_comercial} de tu fichero? Dejarás de verla (sus pedidos se conservan).`)) return;
    try {
      await cambiarMiFichero(sb, usuario.id, [c.codigo_interno], 'quitar');
      setAbierto(null);
      await refrescarFarmaciasDelDispositivo();
      mostrar({ tipo: 'ok', texto: `${c.nombre_comercial} salió de tu fichero.` });
    } catch (e: unknown) {
      mostrar({ tipo: 'error', texto: navigator.onLine === false ? 'Necesitas conexión a internet para cambiar tu fichero.' : e instanceof Error ? e.message : String(e) });
    }
  };
  const propios = useMemo(() => (esVendedor ? pedidos.filter((p) => p.vendedor_id === usuario.id) : pedidos), [pedidos, esVendedor, usuario.id]);
  const actividad = useMemo(() => actividadDeClientes(clientes, ultimaCompraPorCliente(compras), ultimoPedidoPorCliente(pedidos)), [clientes, compras, pedidos]);
  const atrasados = useMemo(() => new Set(clientesPorAtender(actividad, Number.MAX_SAFE_INTEGER).map((a) => a.cliente.id)), [actividad]);
  const zonas = useMemo(() => Array.from(new Set(clientes.map((c) => c.brick).filter((z): z is string => !!z))).sort(), [clientes]);

  const filtrados = useMemo(() => {
    const t = normalizar(q);
    return actividad
      .filter((a) => !t || a.cliente.busqueda.includes(t))
      .filter((a) => !zona || a.cliente.brick === zona)
      .filter((a) => !soloAtrasados || atrasados.has(a.cliente.id))
      .sort((x, y) => x.cliente.nombre_comercial.localeCompare(y.cliente.nombre_comercial));
  }, [actividad, q, zona, soloAtrasados, atrasados]);

  const seleccionado = abierto ? clientes.find((c) => c.id === abierto) : undefined;

  return (
    <div>
      <PageHeader
        titulo={esVendedor ? 'Mis clientes' : 'Clientes'}
        descripcion={`${clientes.length} farmacia${clientes.length === 1 ? '' : 's'}${esVendedor ? ' en tu fichero' : ''}`}
        acciones={puedeEditarFichero ? <Boton variante="primario" icono={Plus} onClick={() => setAgregando(true)}>Agregar farmacias</Boton> : undefined}
      />
      {nodo}
      {puedeEditarFichero && (
        <AgregarFarmacias
          abierto={agregando}
          vendedorId={usuario.id}
          onCerrar={() => setAgregando(false)}
          onAgregadas={(n) => mostrar({ tipo: 'ok', texto: n === 1 ? 'Se agregó 1 farmacia a tu fichero.' : `Se agregaron ${n} farmacias a tu fichero.` })}
        />
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={texto} onChange={(e) => { setTexto(e.target.value); setLimite(POR_PAGINA); }} placeholder="Buscar por nombre, RIF, código o zona" aria-label="Buscar cliente" className={`${estiloInput} pl-9`} />
        </div>
        {zonas.length > 1 && (
          <select value={zona} onChange={(e) => { setZona(e.target.value); setLimite(POR_PAGINA); }} aria-label="Zona" className={`${estiloInput} w-auto`}>
            <option value="">Todas las zonas</option>
            {zonas.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        )}
        <Boton variante={soloAtrasados ? 'primario' : 'secundario'} onClick={() => { setSoloAtrasados((v) => !v); setLimite(POR_PAGINA); }}>
          Por atender{atrasados.size > 0 ? ` (${atrasados.size})` : ''}
        </Boton>
      </div>

      <Tarjeta className="!p-0">
        {filtrados.length === 0 ? (
          <Vacio
            icono={Users}
            titulo={clientes.length === 0 ? (esVendedor ? 'Aún no tienes clientes asignados' : 'Todavía no hay clientes') : 'Sin resultados'}
            texto={clientes.length === 0 ? (esVendedor ? (puedeEditarFichero ? 'Toca "Agregar farmacias" y marca las que atiendes.' : 'Pídele a un administrador que te asigne tu fichero.') : 'Cárgalos desde "Datos maestros".') : 'Prueba con otra búsqueda o quita los filtros.'}
          />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtrados.slice(0, limite).map(({ cliente: c, dias, atraso }) => (
              <li key={c.id}>
                <button type="button" onClick={() => setAbierto(c.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{c.nombre_comercial}</p>
                    <p className="truncate text-xs text-slate-500">
                      {[c.codigo_interno, c.municipio ?? c.brick, c.frecuencia_dias ? `cada ${c.frecuencia_dias} días` : null].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {c.estado_validacion !== 'activo' && <Etiqueta tono="ambar">{c.estado_validacion === 'prospecto_pendiente' ? 'Por validar' : 'Inactivo'}</Etiqueta>}
                    {c.segmento === 'vip' && <Etiqueta tono="teal">VIP</Etiqueta>}
                    <span className={`text-xs ${atraso != null && atraso > 0 ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>{dias == null ? 'sin compras' : `hace ${dias} d`}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {filtrados.length > limite && (
          <div className="border-t border-slate-100 p-2 text-center dark:border-slate-800">
            <Boton variante="suave" onClick={() => setLimite((l) => l + POR_PAGINA)}>Ver más ({filtrados.length - limite})</Boton>
          </div>
        )}
      </Tarjeta>

      <Sheet abierto={!!seleccionado} titulo={seleccionado?.nombre_comercial ?? ''} onCerrar={() => setAbierto(null)} ancho="md:max-w-xl">
        {seleccionado && (
          <FichaCliente
            cliente={seleccionado}
            compras={compras.filter((c) => c.cliente_id === seleccionado.id)}
            pedidos={propios.filter((p) => p.cliente_id === seleccionado.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5)}
            nombreProducto={(id) => productos.find((p) => p.id === id)?.nombre_comercial ?? 'Producto'}
            cuentas={mapClientes.filter((m) => m.cliente_id === seleccionado.id).map((m) => ({ drogueria: droguerias.find((d) => d.id === m.drogueria_id)?.nombre ?? 'Droguería', cuenta: m.codigo_cuenta, nombre: m.nombre_en_drogueria ?? null, principal: m.es_principal !== false }))}
            puedePedir={usuario.rol === 'vendedor' || usuario.rol === 'admin'}
            onPedido={() => { prepararPedidoPara(seleccionado.id); setAbierto(null); irATab('captura'); }}
            onQuitar={puedeEditarFichero && seleccionado.codigo_interno ? () => void quitarDeMiFichero(seleccionado) : undefined}
            onVisita={esVendedor ? () => registrarVisita(seleccionado) : undefined}
          />
        )}
      </Sheet>
    </div>
  );
}

function FichaCliente({
  cliente: c,
  compras,
  pedidos,
  nombreProducto,
  cuentas,
  puedePedir,
  onPedido,
  onQuitar,
  onVisita,
}: {
  cliente: LocalCliente;
  compras: { producto_id: string; periodo: string; unidades: number }[];
  pedidos: { id: string; correlativo: string; estado: keyof typeof ESTADOS_ETIQUETA; created_at: string }[];
  nombreProducto: (id: string) => string;
  cuentas: { drogueria: string; cuenta: string | null; nombre: string | null; principal: boolean }[];
  puedePedir: boolean;
  onPedido: () => void;
  /** Solo el vendedor, en su propio fichero. */
  onQuitar?: () => void;
  onVisita?: () => void;
}) {
  // Lo que más compró en los últimos 3 meses con datos.
  const periodos = Array.from(new Set(compras.map((x) => x.periodo))).sort().reverse().slice(0, 3);
  const top = new Map<string, number>();
  compras.filter((x) => periodos.includes(x.periodo)).forEach((x) => top.set(x.producto_id, (top.get(x.producto_id) ?? 0) + x.unidades));
  const masComprados = [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const mapa = c.lat != null && c.lon != null ? `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lon}` : null;

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-2">
        {puedePedir && <Boton variante="primario" icono={ClipboardPlus} onClick={onPedido}>Tomar pedido</Boton>}
        {c.telefono && <a href={`tel:${c.telefono}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold dark:border-slate-700"><Phone className="h-4 w-4" />{c.telefono}</a>}
        {mapa && <a href={mapa} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold dark:border-slate-700"><MapPin className="h-4 w-4" />Cómo llegar</a>}
        {onVisita && <Boton icono={MapPinCheck} onClick={onVisita}>Registrar visita</Boton>}
        {onQuitar && <Boton variante="fantasma" icono={UserMinus} onClick={onQuitar}>Quitar de mi fichero</Boton>}
      </div>

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

      <section>
        <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Últimos pedidos</h3>
        {pedidos.length === 0 ? (
          <p className="text-xs text-slate-500">Sin pedidos en Nova.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {pedidos.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span>{p.correlativo} · {diasDesde(p.created_at)} d</span>
                <Etiqueta tono={ESTADOS_ETIQUETA[p.estado].tono} punto>{ESTADOS_ETIQUETA[p.estado].texto}</Etiqueta>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
