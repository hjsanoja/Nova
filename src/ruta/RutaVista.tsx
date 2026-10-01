import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardPlus, Crosshair, MapPin, Navigation, Stethoscope } from 'lucide-react';
import { Medidor } from '../components/graficos/Graficos';
import { Boton, Etiqueta, PageHeader, Segmentado, Tarjeta, Vacio, useAviso } from '../components/ui/kit';
import { obtenerDb } from '../offline/db';
import { distanciaMetros } from '../offline/pedidos';
import { useLive } from '../offline/useLive';
import type { LocalCliente, LocalMedico, LocalVisita } from '../offline/types';
import { VisitaForm } from '../crm/VisitaForm';
import type { DestinoVisita } from '../crm/VisitaForm';
import { leerUbicacion, fechaCorta, useMedicos } from '../crm/datos';
import { coberturaMedicos } from '../crm/medicos';
import type { Usuario } from '../types/pharmacy';
import { actividadDeClientes } from '../vistas/logica';
import { prepararPedidoPara } from '../vistas/navegacion';
import { ultimaCompraPorCliente, ultimoPedidoPorCliente, useClientes, useCompras, usePedidos, useProductos } from '../vistas/useDatos';
import { distanciaTexto, enlaceComoLlegar, leToca, ordenarRuta } from './logica';

const MapaRuta = lazy(() => import('./MapaRuta').then((m) => ({ default: m.MapaRuta })));

const hoyLocal = () => new Date().toDateString();
const RADIO_M = 100;

/**
 * Ruta del día: las farmacias del fichero a las que les toca visita, ordenadas por cercanía, en un mapa, y los médicos de la
 * cartera que faltan por visitar este mes (visitador mixto). Desde cada uno se abre la navegación, se registra la visita
 * con su reporte y el GPS (queda la distancia al lugar) o se toma el pedido.
 */
export function RutaVista({ usuario, irATab }: { usuario: Usuario; irATab: (t: string) => void }) {
  const db = obtenerDb();
  const clientes = useClientes();
  const compras = useCompras();
  const pedidos = usePedidos();
  const visitas = useLive(() => db.visitas.where('vendedor_id').equals(usuario.id).toArray(), [usuario.id], [] as LocalVisita[]);
  const [origen, setOrigen] = useState<{ lat: number; lon: number } | null>(null);
  const [ubicando, setUbicando] = useState(false);
  const [vista, setVista] = useState<'hoy' | 'todas' | 'medicos'>('hoy');
  const [visitando, setVisitando] = useState<DestinoVisita | null>(null);
  const productos = useProductos();
  const medicos = useMedicos();
  const misMedicos = useMemo(() => medicos.filter((m) => m.vendedor_id === usuario.id), [medicos, usuario.id]);
  const cobertura = useMemo(() => coberturaMedicos(misMedicos, visitas), [misMedicos, visitas]);
  const medicosPendientes = cobertura.filter((c) => c.hechas < c.esperadas).length;
  const medicosOrdenados = useMemo(() => {
    if (!origen) return cobertura;
    const d = (m: LocalMedico) => (m.lat != null && m.lon != null ? distanciaMetros(origen.lat, origen.lon, m.lat, m.lon) : Number.MAX_SAFE_INTEGER);
    return [...cobertura].sort((a, b) => Number(a.hechas >= a.esperadas) - Number(b.hechas >= b.esperadas) || d(a.medico) - d(b.medico));
  }, [cobertura, origen]);
  const { mostrar, nodo } = useAviso();

  const propios = useMemo(() => pedidos.filter((p) => p.vendedor_id === usuario.id), [pedidos, usuario.id]);
  const actividad = useMemo(() => actividadDeClientes(clientes, ultimaCompraPorCliente(compras), ultimoPedidoPorCliente(propios)), [clientes, compras, propios]);
  const visitasHoy = useMemo(() => visitas.filter((v) => new Date(v.checkin_en).toDateString() === hoyLocal()), [visitas]);
  const visitadas = useMemo(() => new Set(visitasHoy.map((v) => v.cliente_id).filter((id): id is string => !!id)), [visitasHoy]);
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

  const visitaGuardada = ({ visita, tarea, conGps }: { visita: LocalVisita; tarea: unknown; conGps: boolean }) => {
    const destino = visitando;
    setVisitando(null);
    if (!destino) return;
    if (conGps && visita.lat != null && visita.lon != null) setOrigen({ lat: visita.lat, lon: visita.lon });
    const nombre = destino.tipo === 'farmacia' ? destino.cliente.nombre_comercial : destino.medico.nombre;
    const lugar = destino.tipo === 'farmacia' ? 'la farmacia' : 'el consultorio';
    const donde = visita.distancia_metros == null ? `sin ubicación de ${lugar} para comparar` : visita.distancia_metros <= RADIO_M ? `en ${lugar} (${distanciaTexto(visita.distancia_metros)})` : `a ${distanciaTexto(visita.distancia_metros)} de ${lugar}`;
    mostrar({ tipo: 'ok', texto: `Visita a ${nombre} registrada ${conGps ? donde : 'sin GPS'}.${tarea ? ' La próxima acción quedó en tus tareas.' : ''}` });
    if (destino.tipo === 'farmacia' && visita.resultado === 'pedido_tomado') {
      prepararPedidoPara(destino.cliente.id);
      irATab('captura');
    }
  };
  const visitarFarmacia = (c: LocalCliente) => setVisitando({ tipo: 'farmacia', cliente: c });

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
          <Medidor valor={hechas} total={paraHoy.length} rotulo="Farmacias de hoy" nota={`${paraHoy.length - hechas} por visitar${recorrido ? ` · recorrido aprox. ${distanciaTexto(recorrido)}` : ''}${origen ? '' : ' · toca "Usar mi ubicación" para ordenar desde donde estás'}`} />
          {misMedicos.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
              <Medidor valor={cobertura.length - medicosPendientes} total={cobertura.length} rotulo="Médicos visitados este mes" nota={`${medicosPendientes} por visitar`} />
            </div>
          )}
        </Tarjeta>
      </div>

      <Segmentado valor={vista} onChange={setVista} opciones={[{ id: 'hoy', texto: 'Para hoy', cuenta: paraHoy.length }, { id: 'todas', texto: 'Todo el fichero', cuenta: actividad.length }, ...(misMedicos.length ? [{ id: 'medicos' as const, texto: 'Médicos', cuenta: medicosPendientes }] : [])]} />

      {vista === 'medicos' ? (
        <ol className="flex flex-col gap-2">
          {medicosOrdenados.map((c) => {
            const m = c.medico;
            const conGps = m.lat != null && m.lon != null;
            const aqui = origen && conGps ? distanciaMetros(origen.lat, origen.lon, m.lat!, m.lon!) : null;
            const listo = c.hechas >= c.esperadas;
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white ${listo ? 'bg-slate-500' : 'bg-marca-700'}`} aria-hidden>{listo ? '✓' : <Stethoscope className="h-4 w-4" />}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{m.nombre}</p>
                  <p className="truncate text-xs text-slate-500">{[m.especialidad, m.centro, aqui != null ? `a ${distanciaTexto(aqui)} de ti` : null].filter(Boolean).join(' · ')}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Etiqueta tono={listo ? 'exito' : 'neutro'}>{c.hechas} de {c.esperadas} este mes</Etiqueta>
                    {m.categoria && <Etiqueta tono={m.categoria === 'A' ? 'marca' : 'neutro'}>Cat. {m.categoria}</Etiqueta>}
                    {c.ultima && <Etiqueta>Última: {fechaCorta(c.ultima)}</Etiqueta>}
                  </div>
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  {conGps && (
                    <a href={enlaceComoLlegar(m.lat!, m.lon!)} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800">
                      <Navigation className="h-3.5 w-3.5" aria-hidden /> Cómo llegar
                    </a>
                  )}
                  <Boton tamano="sm" variante={listo ? 'secundario' : 'primario'} icono={CheckCircle2} onClick={() => setVisitando({ tipo: 'medico', medico: m })}>Registrar visita</Boton>
                </div>
              </li>
            );
          })}
        </ol>
      ) : paradas.length === 0 ? (
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
                  {!p.visitadaHoy && <Boton tamano="sm" icono={CheckCircle2} onClick={() => visitarFarmacia(c)}>Registrar visita</Boton>}
                  <Boton tamano="sm" variante="primario" icono={ClipboardPlus} onClick={() => { prepararPedidoPara(c.id); irATab('captura'); }}>Pedido</Boton>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {visitando && <VisitaForm destino={visitando} vendedorId={usuario.id} productos={productos} onCerrar={() => setVisitando(null)} onGuardada={visitaGuardada} />}
    </div>
  );
}
