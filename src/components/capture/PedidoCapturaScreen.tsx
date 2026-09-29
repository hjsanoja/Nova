import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, LocateFixed, MapPinCheck, Minus, Plus, ScanLine, Search, ShoppingBasket, Sparkles, Bookmark } from 'lucide-react';
import { obtenerDb } from '../../offline/db';
import { buscarPorCodigo, buscarProductos } from '../../offline/busqueda';
import { condicionesDisponibles, evaluarPedido } from '../../offline/politicas';
import type { ContextoPedido, ReglaComercial } from '../../offline/politicas';
import { crearPedidoLocal, guardarPlantillaLocal, registrarVisitaLocal } from '../../offline/pedidos';
import { solicitarSync } from '../../offline/motor';
import { calcularSugerido, productosComprados } from '../../offline/sugerido';
import { useEstadoSync } from '../../offline/syncStore';
import { useLive } from '../../offline/useLive';
import type { LocalCliente, LocalDrogueria, LocalProducto } from '../../offline/types';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { CarritoPanel } from './CarritoPanel';
import { ClienteSheet } from './ClienteSheet';
import { PlantillasSheet } from './PlantillasSheet';
import { Sheet } from './Sheet';
import { useCarrito } from './useCarrito';

const ScannerSheet = React.lazy(() => import('./ScannerSheet').then((m) => ({ default: m.ScannerSheet })));

interface Props {
  vendedorId: string;
  equipoId?: string | null;
}

/**
 * Captura de pedidos para móvil y tablet, pensada para trabajar sin conexión:
 *  - todo sale de IndexedDB (catálogo, clientes, reglas): la búsqueda responde en milisegundos sin red
 *  - móvil: búsqueda arriba, carrito flotante abajo que abre una hoja; tablet/PC: carrito fijo a la derecha
 *  - las condiciones comerciales se validan con las reglas cacheadas en el dispositivo
 */
export const PedidoCapturaScreen: React.FC<Props> = ({ vendedorId, equipoId }) => {
  const db = obtenerDb();
  const sesion = useMemo(() => ({ vendedor_id: vendedorId, equipo_id: equipoId ?? null }), [vendedorId, equipoId]);
  const { carrito, dispatch, cargado } = useCarrito(db);
  const { online } = useEstadoSync();
  const esTablet = useMediaQuery('(min-width: 768px)');

  const [consulta, setConsulta] = useState('');
  const consultaDiferida = useDeferredValue(consulta);
  const [hojaCliente, setHojaCliente] = useState(false);
  const [hojaCarrito, setHojaCarrito] = useState(false);
  const [hojaScanner, setHojaScanner] = useState(false);
  const [hojaPlantillas, setHojaPlantillas] = useState(false);
  const [hojaNombrePlantilla, setHojaNombrePlantilla] = useState(false);
  const [nombrePlantilla, setNombrePlantilla] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; tipo: 'ok' | 'error' } | null>(null);
  const temporizadorAviso = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const mostrarAviso = useCallback((texto: string, tipo: 'ok' | 'error' = 'ok') => {
    setAviso({ texto, tipo });
    clearTimeout(temporizadorAviso.current);
    temporizadorAviso.current = setTimeout(() => setAviso(null), 4000);
  }, []);
  useEffect(() => () => clearTimeout(temporizadorAviso.current), []);

  const resultados = useLive(() => buscarProductos(db, consultaDiferida), [consultaDiferida], [] as LocalProducto[]);
  const droguerias = useLive(() => db.droguerias.filter((d) => d.activo).toArray(), [], [] as LocalDrogueria[]);
  const reglas = useLive(() => db.reglas.toArray(), [], [] as ReglaComercial[]);
  const cliente = useLive(() => (carrito.cliente_id ? db.clientes.get(carrito.cliente_id) : undefined), [carrito.cliente_id], undefined as LocalCliente | undefined);
  const comprados = useLive(() => productosComprados(db, carrito.cliente_id), [carrito.cliente_id], [] as LocalProducto[]);

  // Droguería por defecto: la primera disponible.
  useEffect(() => {
    if (cargado && !carrito.drogueria_id && droguerias[0]) dispatch({ tipo: 'drogueria', id: droguerias[0].id });
  }, [cargado, carrito.drogueria_id, droguerias, dispatch]);

  const contexto = useMemo<ContextoPedido>(
    () => ({
      equipo_id: equipoId ?? null,
      drogueria_id: carrito.drogueria_id,
      segmento: cliente?.segmento,
      cliente_validado: cliente?.estado_validacion === 'activo',
      lineas: carrito.lineas.map((l) => ({ producto_id: l.producto.id, sku: l.producto.sku, categoria: l.producto.categoria, unidades: l.unidades, descuento_pct: l.descuento_pct })),
      descuento_pedido_pct: carrito.descuento_pedido_pct,
    }),
    [equipoId, carrito.drogueria_id, carrito.lineas, carrito.descuento_pedido_pct, cliente]
  );
  const evaluacion = useMemo(() => evaluarPedido(reglas, contexto), [reglas, contexto]);
  const condiciones = useMemo(() => condicionesDisponibles(reglas, contexto), [reglas, contexto]);

  const enCarrito = useMemo(() => new Map(carrito.lineas.map((l) => [l.producto.id, l.unidades])), [carrito.lineas]);
  const unidadesTotales = carrito.lineas.reduce((a, l) => a + l.unidades, 0);

  const agregarPorCodigo = useCallback(
    async (codigo: string) => {
      const p = await buscarPorCodigo(db, codigo);
      if (!p) return mostrarAviso(`Código ${codigo} no está en el catálogo`, 'error');
      dispatch({ tipo: 'agregar', producto: p });
      mostrarAviso(`Añadido: ${p.nombre_comercial}`);
    },
    [db, dispatch, mostrarAviso]
  );

  const guardar = async (enviar: boolean) => {
    if (!carrito.cliente_id) return mostrarAviso('Elige la farmacia', 'error');
    if (!carrito.drogueria_id) return mostrarAviso('Elige la droguería', 'error');
    setGuardando(true);
    try {
      const pedido = await crearPedidoLocal(
        db,
        {
          cliente_id: carrito.cliente_id,
          drogueria_id: carrito.drogueria_id,
          lineas: carrito.lineas.map((l) => ({ producto_id: l.producto.id, unidades: l.unidades, descuento_pct: l.descuento_pct || null })),
          observaciones: carrito.observaciones || null,
          condicion_comercial_id: carrito.condicion_id,
          descuento_pedido_pct: carrito.descuento_pedido_pct || null,
          enviar,
        },
        sesion
      );
      dispatch({ tipo: 'vaciar_lineas' });
      setHojaCarrito(false);
      solicitarSync();
      const destino = pedido.estado === 'en_revision' ? 'Revisión Especial' : enviar ? 'transferencista' : 'borradores';
      mostrarAviso(`${pedido.correlativo} guardado (${destino})${online ? '' : ' · se enviará al recuperar red'}`);
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : 'No se pudo guardar el pedido', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const guardarPlantilla = async (e: React.FormEvent) => {
    e.preventDefault();
    await guardarPlantillaLocal(
      db,
      { nombre: nombrePlantilla, cliente_id: carrito.cliente_id, drogueria_id: carrito.drogueria_id, items: carrito.lineas.map((l) => ({ producto_id: l.producto.id, unidades: l.unidades })) },
      sesion
    );
    solicitarSync();
    setHojaNombrePlantilla(false);
    setNombrePlantilla('');
    mostrarAviso('Plantilla guardada');
  };

  const aplicarItems = async (items: { producto_id: string; unidades: number }[], nombre: string) => {
    const productos = await db.productos.bulkGet(items.map((i) => i.producto_id));
    const lineas = items.flatMap((i, k) => (productos[k]?.activo ? [{ producto: productos[k]!, unidades: i.unidades }] : []));
    dispatch({ tipo: 'agregar_varios', lineas });
    setHojaPlantillas(false);
    mostrarAviso(`${nombre}: ${lineas.length} productos en el carrito`);
  };

  const sugerir = async () => {
    if (!cliente) return mostrarAviso('Elige la farmacia para calcular el sugerido', 'error');
    const sugerido = await calcularSugerido(db, cliente);
    if (sugerido.length === 0) return mostrarAviso('Sin historial suficiente para sugerir', 'error');
    dispatch({ tipo: 'agregar_varios', lineas: sugerido.map((s) => ({ producto: s.producto, unidades: s.unidades })) });
    mostrarAviso(`Sugerido cargado: ${sugerido.length} productos`);
  };

  const hacerCheckin = () => {
    if (!cliente) return mostrarAviso('Elige la farmacia para hacer check-in', 'error');
    if (!navigator.geolocation) return mostrarAviso('Este dispositivo no tiene GPS', 'error');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const v = await registrarVisitaLocal(db, { cliente_id: cliente.id, lat: pos.coords.latitude, lon: pos.coords.longitude, precision_gps_m: pos.coords.accuracy }, sesion);
        solicitarSync();
        if (v.distancia_metros == null) mostrarAviso('Check-in registrado (la farmacia no tiene ubicación guardada)');
        else mostrarAviso(`Check-in a ${v.distancia_metros} m de la farmacia · ${v.dentro_de_radio ? 'dentro del radio' : 'fuera del radio (100 m)'}`, v.dentro_de_radio ? 'ok' : 'error');
      },
      () => mostrarAviso('No se pudo obtener la ubicación', 'error'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 }
    );
  };

  const panelCarrito = (
    <CarritoPanel
      carrito={carrito}
      dispatch={dispatch}
      cliente={cliente}
      reglas={reglas}
      contexto={contexto}
      evaluacion={evaluacion}
      condiciones={condiciones}
      online={online}
      guardando={guardando}
      onEnviar={() => void guardar(true)}
      onBorrador={() => void guardar(false)}
      onPlantilla={() => setHojaNombrePlantilla(true)}
    />
  );

  const lista = consultaDiferida.trim() ? resultados : comprados;
  const tituloLista = consultaDiferida.trim() ? `${resultados.length} resultado${resultados.length === 1 ? '' : 's'}` : comprados.length ? 'Comprados antes por esta farmacia' : '';

  return (
    <div className="pb-24 md:pb-0">
      <h1 className="sr-only">Captura de pedido</h1>

      {aviso && (
        <div role="status" aria-live="polite" className={`animate-in fixed inset-x-3 top-16 z-[60] mx-auto max-w-md rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl ${aviso.tipo === 'ok' ? 'bg-slate-900' : 'bg-rose-600'}`}>
          {aviso.texto}
        </div>
      )}

      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_360px] lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-6">
        <section className="min-w-0 space-y-3">
          {/* Farmacia y droguería */}
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
            <button type="button" onClick={() => setHojaCliente(true)} className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-left dark:border-slate-700 dark:bg-slate-900">
              <span className="min-w-0">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Farmacia</span>
                <span className="block truncate font-bold text-slate-900 dark:text-white">{cliente?.nombre_comercial ?? 'Elegir farmacia'}</span>
                {cliente && (
                  <span className="block truncate text-xs text-slate-500">
                    {cliente.estado_validacion === 'prospecto_pendiente' ? 'Prospecto pendiente' : cliente.segmento === 'vip' ? 'Cliente VIP' : cliente.rif}
                  </span>
                )}
              </span>
              <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
            </button>
            <label className="relative block">
              <span className="sr-only">Droguería destino</span>
              <select
                value={carrito.drogueria_id ?? ''}
                onChange={(e) => dispatch({ tipo: 'drogueria', id: e.target.value || null })}
                className="min-h-14 w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 pr-10 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                {droguerias.length === 0 && <option value="">Sin droguerías</option>}
                {droguerias.map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            </label>
          </div>

          {/* Búsqueda ultrarrápida: pegada arriba mientras se recorre la lista */}
          <div className="sticky top-14 z-20 -mx-3.5 bg-slate-50/95 px-3.5 py-2 dark:bg-slate-950/95 sm:-mx-6 sm:px-6 md:mx-0 md:px-0">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  inputMode="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  value={consulta}
                  onChange={(e) => setConsulta(e.target.value)}
                  placeholder="Nombre, molécula, SKU o código de barras"
                  aria-label="Buscar producto"
                  className="min-h-14 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 text-base text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <button type="button" onClick={() => setHojaScanner(true)} aria-label="Escanear código de barras" className="inline-flex min-h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-sm active:scale-95">
                <ScanLine className="h-6 w-6" />
              </button>
            </div>
            <div className="mt-2 flex gap-2 overflow-x-auto scrollbar-none">
              <button type="button" onClick={() => void sugerir()} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                <Sparkles className="h-4 w-4 text-teal-600" /> Sugerido
              </button>
              <button type="button" onClick={() => setHojaPlantillas(true)} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                <Bookmark className="h-4 w-4 text-teal-600" /> Plantillas
              </button>
              <button type="button" onClick={hacerCheckin} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                <LocateFixed className="h-4 w-4 text-teal-600" /> Check-in
              </button>
            </div>
          </div>

          {/* Resultados */}
          {tituloLista && <p className="px-1 text-xs font-bold uppercase tracking-wider text-slate-400">{tituloLista}</p>}
          <ul className="space-y-2">
            {lista.map((p) => {
              const unidades = enCarrito.get(p.id);
              const paso = Math.max(1, p.empaque_minimo);
              return (
                <li key={p.id} className="cv-auto flex min-h-[4.5rem] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                  <button type="button" onClick={() => dispatch({ tipo: 'agregar', producto: p })} className="min-w-0 flex-1 text-left">
                    <span className="block truncate font-semibold text-slate-900 dark:text-white">
                      {p.nombre_comercial}
                      {p.es_prioritario && <span className="ml-1.5 align-middle text-[10px] font-bold uppercase text-amber-600">Prioritario</span>}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {[p.presentacion, p.sku].filter(Boolean).join(' · ')} · empaque x{paso}
                    </span>
                  </button>
                  {unidades ? (
                    <div className="flex items-center gap-1">
                      <button type="button" aria-label="Restar" onClick={() => dispatch({ tipo: 'unidades', productoId: p.id, unidades: unidades - paso })} className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-10 text-center font-mono text-lg font-bold text-teal-700 dark:text-teal-300">{unidades}</span>
                      <button type="button" aria-label="Sumar" onClick={() => dispatch({ tipo: 'unidades', productoId: p.id, unidades: unidades + paso })} className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-teal-600 text-white">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button type="button" aria-label={`Agregar ${p.nombre_comercial}`} onClick={() => dispatch({ tipo: 'agregar', producto: p })} className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-teal-600 text-white active:scale-95">
                      <Plus className="h-5 w-5" />
                    </button>
                  )}
                </li>
              );
            })}
            {consultaDiferida.trim() && resultados.length === 0 && <li className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">Sin resultados para “{consultaDiferida}”.</li>}
            {!consultaDiferida.trim() && comprados.length === 0 && (
              <li className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700">
                <MapPinCheck className="h-5 w-5 shrink-0 text-slate-400" />
                Escribe para buscar en el catálogo. Funciona sin conexión.
              </li>
            )}
          </ul>
        </section>

        {/* Carrito fijo en tablet y PC */}
        {esTablet && (
          <aside aria-label="Carrito" className="sticky top-[4.5rem] max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-3 font-display text-lg font-bold text-slate-900 dark:text-white">Carrito</h2>
            {panelCarrito}
          </aside>
        )}
      </div>

      {/* Carrito flotante en móvil */}
      {!esTablet && carrito.lineas.length > 0 && (
        <button
          type="button"
          onClick={() => setHojaCarrito(true)}
          className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex min-h-14 items-center justify-between rounded-2xl bg-teal-600 px-4 text-white shadow-xl active:scale-[0.99]"
        >
          <span className="flex items-center gap-2 font-bold">
            <ShoppingBasket className="h-5 w-5" />
            {carrito.lineas.length} producto{carrito.lineas.length === 1 ? '' : 's'} · {unidadesTotales} uds
            {evaluacion.requiere_revision_especial && <span className="h-2.5 w-2.5 rounded-full bg-amber-300" aria-label="Revisión especial" />}
          </span>
          <span className="font-semibold">Ver carrito ›</span>
        </button>
      )}

      <Sheet abierto={!esTablet && hojaCarrito} titulo="Carrito" onCerrar={() => setHojaCarrito(false)}>
        {panelCarrito}
      </Sheet>
      <ClienteSheet
        abierto={hojaCliente}
        onCerrar={() => setHojaCliente(false)}
        onElegir={(c) => {
          dispatch({ tipo: 'cliente', id: c.id });
          setHojaCliente(false);
        }}
      />
      <PlantillasSheet abierto={hojaPlantillas} clienteId={carrito.cliente_id} onCerrar={() => setHojaPlantillas(false)} onAplicar={(items, nombre) => void aplicarItems(items, nombre)} />
      <Sheet abierto={hojaNombrePlantilla} titulo="Guardar como plantilla" onCerrar={() => setHojaNombrePlantilla(false)}>
        <form onSubmit={guardarPlantilla} className="space-y-3">
          <input autoFocus required value={nombrePlantilla} onChange={(e) => setNombrePlantilla(e.target.value)} placeholder="Ej. Reposición semanal" aria-label="Nombre de la plantilla" className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          <button type="submit" className="min-h-12 w-full rounded-xl bg-teal-600 font-bold text-white">Guardar</button>
        </form>
      </Sheet>
      {hojaScanner && (
        <React.Suspense fallback={null}>
          <ScannerSheet abierto onCerrar={() => setHojaScanner(false)} onCodigo={(c) => void agregarPorCodigo(c)} />
        </React.Suspense>
      )}
    </div>
  );
};
