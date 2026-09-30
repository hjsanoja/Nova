import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Mic, ScanLine, Search, ShoppingCart } from 'lucide-react';
import { obtenerDb } from '../offline/db';
import { buscarPorCodigo, normalizar } from '../offline/busqueda';
import { solicitarSync } from '../offline/motor';
import { calcularSugerido, productosComprados } from '../offline/sugerido';
import { useLive } from '../offline/useLive';
import { useEstadoSync } from '../offline/syncStore';
import type { ReglaComercial } from '../offline/politicas';
import type { LocalCliente, LocalDrogueria, LocalProducto } from '../offline/types';
import { Sheet } from '../components/capture/Sheet';
import { Avatar, Boton, Filtros, PageHeader, Tarjeta, Vacio, estiloInput, useAviso } from '../components/ui/kit';
import { useClientes, useMapClientes } from '../vistas/useDatos';
import { consumirClienteDePedido } from '../vistas/navegacion';
import { totales } from './carritos';
import type { Carrito } from './carritos';
import { enviarCarritos, useCarritos } from './useCarritos';
import { PanelCarrito } from './PanelCarrito';
import { SelectorCliente } from './SelectorCliente';
import { TarjetaProducto } from './TarjetaProducto';
import { DictadoHoja } from './DictadoHoja';

const ScannerSheet = React.lazy(() => import('../components/capture/ScannerSheet').then((m) => ({ default: m.ScannerSheet })));

type Filtro = 'todos' | 'sugeridos' | 'comprados' | 'prioritarios';
const POR_PAGINA = 40;

/**
 * Nuevo pedido, como una tienda: se elige la farmacia, se buscan productos y se agregan al carrito; se pueden llevar
 * varios carritos a la vez (uno por farmacia) y enviarlos juntos. También se puede dictar el pedido.
 * Todo funciona sin conexión: los pedidos quedan en cola y se envían al volver la señal.
 */
export function TiendaVista({ vendedorId, equipoId }: { vendedorId: string; equipoId?: string | null }) {
  const db = obtenerDb();
  const { estado, dispatch, cargado } = useCarritos(db);
  const { online } = useEstadoSync();
  const { mostrar, nodo } = useAviso();

  const productos = useLive(() => db.productos.filter((p) => p.activo).toArray(), [], [] as LocalProducto[]);
  const clientes = useClientes();
  const droguerias = useLive(() => db.droguerias.filter((d) => d.activo).toArray(), [], [] as LocalDrogueria[]);
  const reglas = useLive(() => db.reglas.toArray(), [], [] as ReglaComercial[]);
  const mapClientes = useMapClientes();

  const porIdProducto = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const porIdCliente = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const activo = estado.carritos.find((c) => c.id === estado.activo) ?? null;
  const cliente = activo ? porIdCliente.get(activo.cliente_id) : undefined;
  const conCarrito = useMemo(() => new Set(estado.carritos.map((c) => c.cliente_id)), [estado.carritos]);

  const [texto, setTexto] = useState('');
  const q = useDeferredValue(texto);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [limite, setLimite] = useState(POR_PAGINA);
  const [eligiendo, setEligiendo] = useState<{ pendiente?: { producto_id: string; unidades: number } } | null>(null);
  const [verCarrito, setVerCarrito] = useState(false);
  const [dictando, setDictando] = useState(false);
  const [escaneando, setEscaneando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const comprados = useLive(() => productosComprados(db, cliente?.id ?? null, 40), [cliente?.id], [] as LocalProducto[]);
  const sugeridos = useLive(async () => (cliente ? calcularSugerido(db, cliente) : []), [cliente?.id], [] as { producto: LocalProducto; unidades: number }[]);
  const sugeridoPorId = useMemo(() => new Map(sugeridos.map((s) => [s.producto.id, s.unidades])), [sugeridos]);
  const compradoIds = useMemo(() => new Set(comprados.map((p) => p.id)), [comprados]);
  const enCarrito = useMemo(() => new Map((activo?.lineas ?? []).map((l) => [l.producto_id, l.unidades])), [activo]);

  /** Droguería sugerida: donde la farmacia tiene su cuenta principal; si no, la última usada; si no, la primera. */
  const drogueriaPara = useCallback(async (clienteId: string) => {
    const principal = mapClientes.find((m) => m.cliente_id === clienteId && m.es_principal !== false);
    if (principal && droguerias.some((d) => d.id === principal.drogueria_id)) return principal.drogueria_id;
    const ultima = await db.leerMeta<string | null>('ultima_drogueria', null);
    if (ultima && droguerias.some((d) => d.id === ultima)) return ultima;
    return droguerias[0]?.id ?? null;
  }, [mapClientes, droguerias, db]);

  const abrirCliente = useCallback(async (c: LocalCliente, pendiente?: { producto_id: string; unidades: number }) => {
    dispatch({ tipo: 'abrir', cliente_id: c.id, drogueria_id: await drogueriaPara(c.id) });
    if (pendiente) dispatch({ tipo: 'agregar', producto_id: pendiente.producto_id, unidades: pendiente.unidades });
  }, [dispatch, drogueriaPara]);

  // Llegó desde "Clientes" o "Inicio" con una farmacia elegida.
  useEffect(() => {
    if (!cargado || clientes.length === 0) return;
    const id = consumirClienteDePedido();
    const c = id ? porIdCliente.get(id) : undefined;
    if (c) void abrirCliente(c);
  }, [cargado, clientes.length, porIdCliente, abrirCliente]);

  const agregar = useCallback((producto_id: string, unidades: number) => {
    if (!activo) return setEligiendo({ pendiente: { producto_id, unidades } });
    dispatch({ tipo: 'agregar', producto_id, unidades });
  }, [activo, dispatch]);

  const lista = useMemo(() => {
    let base: LocalProducto[];
    if (filtro === 'sugeridos') base = sugeridos.map((s) => s.producto);
    else if (filtro === 'comprados') base = comprados;
    else if (filtro === 'prioritarios') base = productos.filter((p) => p.es_prioritario);
    else base = productos;
    const palabras = normalizar(q).split(' ').filter(Boolean);
    const filtrados = palabras.length ? base.filter((p) => palabras.every((w) => p.tokens.some((t) => t.startsWith(w)))) : base;
    if (filtro !== 'todos') return filtrados;
    return [...filtrados].sort((a, b) => Number(b.es_prioritario) - Number(a.es_prioritario) || Number(compradoIds.has(b.id)) - Number(compradoIds.has(a.id)) || a.nombre_comercial.localeCompare(b.nombre_comercial));
  }, [filtro, sugeridos, comprados, productos, q, compradoIds]);

  const enviar = async (carritos: Carrito[]) => {
    setEnviando(true);
    try {
      const r = await enviarCarritos(db, carritos, { reglas, productos: porIdProducto, clientes: porIdCliente, sesion: { vendedor_id: vendedorId, equipo_id: equipoId ?? null } });
      const ok = r.filter((x) => x.ok);
      dispatch({ tipo: 'enviados', ids: ok.map((x) => x.carrito_id) });
      if (ok.length) solicitarSync();
      const fallidos = r.filter((x) => !x.ok);
      const revision = ok.filter((x) => x.enRevision).length;
      if (fallidos.length) mostrar({ tipo: 'error', texto: `No se enviaron ${fallidos.length}: ${fallidos.map((f) => `${porIdCliente.get(f.cliente_id)?.nombre_comercial ?? 'farmacia'} (${f.error})`).join('; ')}` });
      else mostrar({ tipo: 'ok', texto: `${ok.length === 1 ? `Pedido ${ok[0].correlativo} enviado` : `${ok.length} pedidos enviados`}${revision ? ` (${revision} a revisión de la mesa)` : ''}${online ? '.' : ' · se transmitirán al volver la señal.'}` });
      if (!fallidos.length) setVerCarrito(false);
    } finally {
      setEnviando(false);
    }
  };

  const t = activo ? totales(activo) : null;
  const panel = (
    <PanelCarrito
      estado={estado}
      dispatch={dispatch}
      clientes={porIdCliente}
      productos={porIdProducto}
      droguerias={droguerias}
      reglas={reglas}
      enviando={enviando}
      onEnviar={(c) => void enviar(c)}
      onNuevaFarmacia={() => setEligiendo({})}
    />
  );

  return (
    <div className="pb-20 lg:pb-0">
      <PageHeader
        titulo="Nuevo pedido"
        descripcion={online ? 'Elige la farmacia y agrega productos.' : 'Sin conexión: los pedidos se enviarán al volver la señal.'}
        acciones={
          <>
            <Boton icono={Mic} onClick={() => setDictando(true)}>Dictar</Boton>
            <Boton icono={ScanLine} onClick={() => setEscaneando(true)} className="hidden sm:inline-flex">Escanear</Boton>
          </>
        }
      />
      {nodo}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          {/* Farmacia del carrito activo */}
          <button type="button" onClick={() => setEligiendo({})} className="mb-3 flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-marca-600 dark:border-slate-800 dark:bg-slate-900">
            {cliente ? <Avatar nombre={cliente.nombre_comercial} tamano={40} /> : <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800"><ShoppingCart className="h-5 w-5" /></span>}
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-slate-500">Pedido para</span>
              <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{cliente?.nombre_comercial ?? 'Elige la farmacia'}</span>
            </span>
            <span className="text-sm font-medium text-marca-700 dark:text-marca-300">{cliente ? 'Cambiar' : 'Elegir'}</span>
            <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden />
          </button>

          <div className="mb-3 flex flex-col gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input value={texto} onChange={(e) => { setTexto(e.target.value); setLimite(POR_PAGINA); }} placeholder="Buscar producto, molécula o código" aria-label="Buscar producto" className={`${estiloInput} pl-9`} />
            </div>
            <Filtros
              valor={filtro}
              onChange={(f) => { setFiltro(f); setLimite(POR_PAGINA); }}
              opciones={[
                { id: 'todos', texto: 'Todos' },
                ...(cliente ? [{ id: 'sugeridos' as const, texto: `Sugeridos${sugeridos.length ? ` (${sugeridos.length})` : ''}` }, { id: 'comprados' as const, texto: 'Lo que compra' }] : []),
                { id: 'prioritarios', texto: 'Prioritarios' },
              ]}
            />
          </div>

          {filtro === 'sugeridos' && sugeridos.length > 0 && activo && (
            <Boton className="mb-3" variante="secundario" onClick={() => dispatch({ tipo: 'agregar_varios', cliente_id: activo.cliente_id, lineas: sugeridos.filter((s) => s.unidades > 0).map((s) => ({ producto_id: s.producto.id, unidades: s.unidades })) })}>
              Agregar todo lo sugerido
            </Boton>
          )}

          {lista.length === 0 ? (
            <Tarjeta>
              <Vacio icono={Search} titulo={productos.length === 0 ? 'El catálogo está vacío' : 'Sin resultados'} texto={productos.length === 0 ? 'Sincroniza o pide al administrador que cargue los productos.' : filtro === 'sugeridos' ? 'Esta farmacia aún no tiene historial para sugerir.' : 'Prueba con otra búsqueda.'} />
            </Tarjeta>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {lista.slice(0, limite).map((p) => (
                <TarjetaProducto
                  key={`${p.id}-${cliente?.id ?? ''}-${sugeridoPorId.get(p.id) ?? 0}`}
                  producto={p}
                  enCarrito={enCarrito.get(p.id) ?? 0}
                  sugerido={sugeridoPorId.get(p.id)}
                  loCompra={compradoIds.has(p.id)}
                  onAgregar={(n) => agregar(p.id, n)}
                />
              ))}
            </div>
          )}
          {lista.length > limite && (
            <div className="mt-3 text-center"><Boton variante="fantasma" onClick={() => setLimite((l) => l + POR_PAGINA)}>Ver más productos ({lista.length - limite})</Boton></div>
          )}
        </div>

        {/* PC: carrito fijo a la derecha */}
        <aside className="hidden lg:block">
          <div className="sticky top-16">
            <Tarjeta>{panel}</Tarjeta>
          </div>
        </aside>
      </div>

      {/* Móvil y tablet: barra del carrito sobre la navegación */}
      <div className="fixed inset-x-0 bottom-16 z-30 px-3 pb-safe md:bottom-3 lg:hidden">
        <button type="button" onClick={() => setVerCarrito(true)} className="mx-auto flex w-full max-w-xl items-center gap-3 rounded-xl bg-marca-700 px-4 py-3 text-left text-white shadow-xl">
          <ShoppingCart className="h-5 w-5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{cliente ? cliente.nombre_comercial : 'Carrito'}</span>
            <span className="block text-xs text-marca-100">{t ? `${t.productos} productos · ${t.unidades} unidades` : 'Vacío'}{estado.carritos.length > 1 ? ` · ${estado.carritos.length} carritos` : ''}</span>
          </span>
          <span className="text-sm font-semibold">Ver</span>
        </button>
      </div>

      <Sheet abierto={verCarrito} titulo="Carrito" onCerrar={() => setVerCarrito(false)}>{panel}</Sheet>
      <SelectorCliente
        abierto={!!eligiendo}
        clientes={clientes}
        conCarrito={conCarrito}
        onCerrar={() => setEligiendo(null)}
        onElegir={(c) => { const pendiente = eligiendo?.pendiente; setEligiendo(null); void abrirCliente(c, pendiente); }}
      />
      <DictadoHoja
        abierto={dictando}
        clientes={clientes}
        productos={productos}
        clienteActual={cliente}
        conCarrito={conCarrito}
        onCerrar={() => setDictando(false)}
        onConfirmar={async (c, lineas) => {
          dispatch({ tipo: 'agregar_varios', cliente_id: c.id, lineas, drogueria_id: await drogueriaPara(c.id) });
          setDictando(false);
          mostrar({ tipo: 'ok', texto: `${lineas.length} producto(s) agregados al carrito de ${c.nombre_comercial}.` });
        }}
      />
      {escaneando && (
        <React.Suspense fallback={null}>
          <ScannerSheet
            abierto={escaneando}
            onCerrar={() => setEscaneando(false)}
            onCodigo={async (codigo) => {
              const p = await buscarPorCodigo(db, codigo);
              if (!p) return mostrar({ tipo: 'error', texto: `El código ${codigo} no está en el catálogo.` });
              agregar(p.id, Math.max(1, p.empaque_minimo));
              mostrar({ tipo: 'ok', texto: `Agregado: ${p.nombre_comercial}` });
            }}
          />
        </React.Suspense>
      )}
    </div>
  );
}
