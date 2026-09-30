import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardPlus, Crosshair, MapPin, Navigation } from 'lucide-react';
import { Sheet } from '../components/capture/Sheet';
import { Medidor } from '../components/graficos/Graficos';
import { Boton, Etiqueta, PageHeader, Segmentado, Tarjeta, Vacio, useAviso } from '../components/ui/kit';
import { obtenerDb } from '../offline/db';
import { distanciaMetros, registrarVisitaLocal } from '../offline/pedidos';
import { solicitarSync } from '../offline/motor';
import { useLive } from '../offline/useLive';
import type { LocalVisita, ResultadoVisita } from '../offline/types';
import type { Usuario } from '../types/pharmacy';
import { actividadDeClientes } from '../vistas/logica';
import { prepararPedidoPara } from '../vistas/navegacion';
import { ultimaCompraPorCliente, ultimoPedidoPorCliente, useClientes, useCompras, usePedidos } from '../vistas/useDatos';
import { distanciaTexto, enlaceComoLlegar, leToca, ordenarRuta } from './logica';
import type { Parada } from './logica';

const MapaRuta = lazy(() => import('./MapaRuta').then((m) => ({ default: m.MapaRuta })));

const RESULTADOS: { id: ResultadoVisita; texto: string }[] = [
  { id: 'pedido_tomado', texto: 'Tomé pedido' },
  { id: 'sin_pedido', texto: 'Sin pedido' },
  { id: 'cliente_cerrado', texto: 'Estaba cerrada' },
  { id: 'reprogramada', texto: 'Reprogramada' },
];
const hoyLocal = () => new Date().toDateString();
const RADIO_M = 100;

/** Ubicación actual (una sola lectura, alta precisión). */
function leerUbicacion(): Promise<GeolocationPosition | null> {
  return new Promise((res) => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(res, () => res(null), { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  });
}

/**
 * Ruta del día: las farmacias del fichero a las que les toca visita, ordenadas por cercanía, en un mapa. Desde cada una se
 * abre la navegación, se registra la visita con el GPS (queda la distancia a la farmacia) o se toma el pedido.
 */
export function RutaVista({ usuario, irATab }: { usuario: Usuario; irATab: (t: string) => void }) {
  const db = obtenerDb();
  const clientes = useClientes();
  const compras = useCompras();
  const pedidos = usePedidos();
  const visitas = useLive(() => db.visitas.where('vendedor_id').equals(usuario.id).toArray(), [usuario.id], [] as LocalVisita[]);
  const [origen, setOrigen] = useState<{ lat: number; lon: number } | null>(null);
  const [ubicando, setUbicando] = useState(false);
  const [vista, setVista] = useState<'hoy' | 'todas'>('hoy');
  const [visitando, setVisitando] = useState<Parada | null>(null);
  const [registrando, setRegistrando] = useState(false);
  const { mostrar, nodo } = useAviso();

  const propios = useMemo(() => pedidos.filter((p) => p.vendedor_id === usuario.id), [pedidos, usuario.id]);
  const actividad = useMemo(() => actividadDeClientes(clientes, ultimaCompraPorCliente(compras), ultimoPedidoPorCliente(propios)), [clientes, compras, propios]);
  const visitasHoy = useMemo(() => visitas.filter((v) => new Date(v.checkin_en).toDateString() === hoyLocal()), [visitas]);
  const visitadas = useMemo(() => new Set(visitasHoy.map((v) => v.cliente_id)), [visitasHoy]);
  const paraHoy = useMemo(() => actividad.filter((a) => leToca(a) || visitadas.has(a.cliente.id)), [actividad, visitadas]);
  const lista = vista === 'hoy' ? paraHoy : actividad;
  const paradas = useMemo(() => ordenarRuta(lista, origen, visitadas), [lista, origen, visitadas]);
  const recorrido = paradas.reduce((a, p) => a + (p.tramo ?? 0), 0);
  const hechas = paraHoy.filter((a) => visitadas.has(a.cliente.id)).length;

  const ubicar = async () => {
    setUbicando(true);
    const pos = await leerUbicacion();
    setUbicando(false);
    if (!pos) return mostrar({ tipo: 'error', texto: 'No se pudo leer tu ubicación. Activa el GPS y permite la ubicación para esta página.' });
    setOrigen({ lat: pos.coords.latitude, lon: pos.coords.longitude });
  };

  const elegir = useCallback((id: string) => document.getElementById(`parada-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), []);

  const registrar = async (p: Parada, resultado: ResultadoVisita) => {
    setRegistrando(true);
    const pos = await leerUbicacion();
    setRegistrando(false);
    const c = p.actividad.cliente;
    const v = await registrarVisitaLocal(db, { cliente_id: c.id, lat: pos?.coords.latitude, lon: pos?.coords.longitude, precision_gps_m: pos?.coords.accuracy, resultado }, { vendedor_id: usuario.id });
    solicitarSync();
    setVisitando(null);
    if (pos) setOrigen({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    const donde = v.distancia_metros == null ? 'sin ubicación de la farmacia para comparar' : v.distancia_metros <= RADIO_M ? `en la farmacia (${distanciaTexto(v.distancia_metros)})` : `a ${distanciaTexto(v.distancia_metros)} de la farmacia`;
    mostrar({ tipo: 'ok', texto: `Visita a ${c.nombre_comercial} registrada ${pos ? donde : 'sin GPS'}.` });
    if (resultado === 'pedido_tomado') {
      prepararPedidoPara(c.id);
      irATab('captura');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        titulo="Mi ruta de hoy"
        descripcion="Farmacias a las que les toca visita, ordenadas por cercanía."
        acciones={<Boton icono={Crosshair} disabled={ubicando} onClick={() => void ubicar()}>{ubicando ? 'Buscando…' : origen ? 'Actualizar ubicación' : 'Usar mi ubicación'}</Boton>}
      />
      {nodo}

      <div className="grid gap-4 lg:grid-cols-3">
        <Tarjeta className="lg:col-span-2 !p-2">
          <Suspense fallback={<div className="h-72 sm:h-96" />}>
            <MapaRuta paradas={paradas} origen={origen} onElegir={elegir} />
          </Suspense>
        </Tarjeta>
        <Tarjeta>
          <Medidor valor={hechas} total={paraHoy.length} rotulo="Visitas de hoy" nota={`${paraHoy.length - hechas} por visitar${recorrido ? ` · recorrido aprox. ${distanciaTexto(recorrido)}` : ''}${origen ? '' : ' · toca "Usar mi ubicación" para ordenar desde donde estás'}`} />
        </Tarjeta>
      </div>

      <Segmentado valor={vista} onChange={setVista} opciones={[{ id: 'hoy', texto: 'Para hoy', cuenta: paraHoy.length }, { id: 'todas', texto: 'Todo el fichero', cuenta: actividad.length }]} />

      {paradas.length === 0 ? (
        <Tarjeta><Vacio icono={MapPin} titulo={clientes.length === 0 ? 'Tu fichero está vacío' : 'Nada pendiente hoy'} texto={clientes.length === 0 ? 'Agrega tus farmacias desde "Mis clientes".' : 'Ninguna farmacia tiene visita pendiente según su frecuencia.'} /></Tarjeta>
      ) : (
        <ol className="flex flex-col gap-2">
          {paradas.map((p, i) => {
            const c = p.actividad.cliente;
            const conGps = c.lat != null && c.lon != null;
            const aqui = origen && conGps ? distanciaMetros(origen.lat, origen.lon, c.lat!, c.lon!) : null;
            return (
              <li key={c.id} id={`parada-${c.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${p.visitadaHoy ? 'bg-slate-500' : conGps ? 'bg-marca-700' : 'bg-slate-400'}`} aria-hidden>
                  {p.visitadaHoy ? '✓' : conGps ? i + 1 : '·'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{c.nombre_comercial}</p>
                  <p className="truncate text-xs text-slate-500">
                    {[c.direccion, aqui != null ? `a ${distanciaTexto(aqui)} de ti` : null, !conGps ? 'sin ubicación registrada' : null].filter(Boolean).join(' · ')}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.visitadaHoy ? <Etiqueta tono="exito">Visitada hoy</Etiqueta> : p.actividad.dias == null ? <Etiqueta tono="aviso">Sin compras registradas</Etiqueta> : p.actividad.atraso != null && p.actividad.atraso > 0 ? <Etiqueta tono="aviso">{p.actividad.atraso} días de atraso</Etiqueta> : <Etiqueta>Cada {c.frecuencia_dias ?? '—'} días</Etiqueta>}
                  </div>
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  {conGps && (
                    <a href={enlaceComoLlegar(c.lat!, c.lon!)} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800">
                      <Navigation className="h-3.5 w-3.5" aria-hidden /> Cómo llegar
                    </a>
                  )}
                  {!p.visitadaHoy && <Boton tamano="sm" icono={CheckCircle2} onClick={() => setVisitando(p)}>Registrar visita</Boton>}
                  <Boton tamano="sm" variante="primario" icono={ClipboardPlus} onClick={() => { prepararPedidoPara(c.id); irATab('captura'); }}>Pedido</Boton>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <Sheet abierto={!!visitando} titulo={visitando ? `Visita a ${visitando.actividad.cliente.nombre_comercial}` : 'Visita'} onCerrar={() => setVisitando(null)}>
        {visitando && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">Se guarda con tu ubicación GPS y la hora. Funciona sin señal: se envía al volver la conexión.</p>
            <div className="grid grid-cols-2 gap-2">
              {RESULTADOS.map((r) => (
                <Boton key={r.id} variante={r.id === 'pedido_tomado' ? 'primario' : 'secundario'} disabled={registrando} onClick={() => void registrar(visitando, r.id)}>{r.texto}</Boton>
              ))}
            </div>
            {registrando && <p role="status" className="text-sm text-slate-500">Buscando tu ubicación…</p>}
          </div>
        )}
      </Sheet>
    </div>
  );
}
