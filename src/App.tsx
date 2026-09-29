import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  RolUsuario,
  EquipoVentas,
  Producto,
  Cliente,
  Drogueria,
  HistoricoPedidoPrevio,
  PedidoCabecera,
  PedidoDetalle,
  MotivoAjuste,
  EstadoPedido,
  Usuario,
} from './types/pharmacy';
import {
  MOCK_USUARIOS,
  MOCK_DROGUERIAS,
  MOCK_PRODUCTOS,
  MOCK_CLIENTES,
  MOCK_HISTORICO_PREVIO,
  MOCK_PEDIDOS_CABECERA,
  MOCK_PEDIDOS_DETALLE,
} from './data/mockData';
import { Header } from './components/Header';
import { SideNav, BottomNav } from './components/shell/Navigation';
import { tabsDelRol, TAB_INICIAL } from './components/shell/navConfig';
import { ErrorBoundary } from './components/ErrorBoundary';
import { getStoredSupabaseConfig } from './services/supabaseConfig';
import { getSupabaseClient } from './services/supabaseClient';
import { descargarCatalogosNube, fusionarPorClave } from './services/nubeV3';
import { leerClientes, leerDroguerias, leerLista, leerProductos, leerUsuario } from './services/storageMigrations';
import { ThemeProvider } from './context/ThemeContext';
import { usePersistentState, EVENTO_ERROR_ALMACENAMIENTO } from './hooks/usePersistentState';
import { AlertTriangle, X } from 'lucide-react';

// Cada pestaña y cada modal pesado se descarga solo cuando se usa (el bundle inicial se reduce a la shell).
const RepDashboardTab = lazy(() => import('./components/RepDashboardTab').then((m) => ({ default: m.RepDashboardTab })));
const PedidoCapturaScreen = lazy(() => import('./components/capture/PedidoCapturaScreen').then((m) => ({ default: m.PedidoCapturaScreen })));
const OrderTakingTab = lazy(() => import('./components/OrderTakingTab').then((m) => ({ default: m.OrderTakingTab })));
const SuggestedOrderTab = lazy(() => import('./components/SuggestedOrderTab').then((m) => ({ default: m.SuggestedOrderTab })));
const MyOrdersTab = lazy(() => import('./components/MyOrdersTab').then((m) => ({ default: m.MyOrdersTab })));
const TeletransferQueueTab = lazy(() => import('./components/TeletransferQueueTab').then((m) => ({ default: m.TeletransferQueueTab })));
const DrugstoreCsvTab = lazy(() => import('./components/DrugstoreCsvTab').then((m) => ({ default: m.DrugstoreCsvTab })));
const DrugstoreInventoryUploadTab = lazy(() => import('./components/DrugstoreInventoryUploadTab').then((m) => ({ default: m.DrugstoreInventoryUploadTab })));
const InventoryCatalogTab = lazy(() => import('./components/InventoryCatalogTab').then((m) => ({ default: m.InventoryCatalogTab })));
const AdminUsersTab = lazy(() => import('./components/AdminUsersTab').then((m) => ({ default: m.AdminUsersTab })));
const DataImportStudioTab = lazy(() => import('./components/DataImportStudioTab').then((m) => ({ default: m.DataImportStudioTab })));
const SqlStudioTab = lazy(() => import('./components/SqlStudioTab').then((m) => ({ default: m.SqlStudioTab })));
const UserGuideTab = lazy(() => import('./components/UserGuideTab').then((m) => ({ default: m.UserGuideTab })));
const BarcodeScannerModal = lazy(() => import('./components/BarcodeScannerModal').then((m) => ({ default: m.BarcodeScannerModal })));
const VoiceDictationModal = lazy(() => import('./components/VoiceDictationModal').then((m) => ({ default: m.VoiceDictationModal })));
const AuthModal = lazy(() => import('./components/AuthModal').then((m) => ({ default: m.AuthModal })));
const SupabaseConfigModal = lazy(() => import('./components/SupabaseConfigModal').then((m) => ({ default: m.SupabaseConfigModal })));
const AboutModal = lazy(() => import('./components/AboutModal').then((m) => ({ default: m.AboutModal })));

type ItemPedido = { producto: Producto; cantidad: number; descuento: number };

const leerTabDelHash = () => window.location.hash.replace(/^#\/?/, '');

const PestanaCargando = () => (
  <div role="status" className="animate-pulse space-y-4" aria-busy="true" aria-label="Cargando sección">
    <div className="h-8 w-64 rounded-lg bg-slate-200 dark:bg-slate-800" />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-24 rounded-2xl bg-slate-200 dark:bg-slate-800" />
      ))}
    </div>
    <div className="h-64 rounded-2xl bg-slate-200 dark:bg-slate-800" />
  </div>
);

function AppContent() {
  // Usuario autenticado en Supabase Auth / local (Hernando Sanoja Dev & Admin por defecto)
  const [usuarioActual, setUsuarioActual] = usePersistentState<Usuario | null>(
    'PHARMA_AUTH_USER',
    () => MOCK_USUARIOS[0],
    leerUsuario
  );
  const [usuarios, setUsuarios] = usePersistentState<Usuario[]>('PHARMA_USUARIOS', () => MOCK_USUARIOS, leerLista);
  const [productos, setProductos] = usePersistentState<Producto[]>('PHARMA_PRODUCTOS', () => MOCK_PRODUCTOS, leerProductos);
  const [clientes, setClientes] = usePersistentState<Cliente[]>('PHARMA_CLIENTES', () => MOCK_CLIENTES, leerClientes);
  const [droguerias, setDroguerias] = usePersistentState<Drogueria[]>('PHARMA_DROGUERIAS_V2', () => MOCK_DROGUERIAS, leerDroguerias);
  const [historicoPrevio, setHistoricoPrevio] = usePersistentState<HistoricoPedidoPrevio[]>(
    'PHARMA_HISTORICO',
    () => MOCK_HISTORICO_PREVIO,
    leerLista
  );
  const [pedidosCabecera, setPedidosCabecera] = usePersistentState<PedidoCabecera[]>(
    'PHARMA_PEDIDOS_CAB',
    () => MOCK_PEDIDOS_CABECERA,
    leerLista
  );
  const [pedidosDetalle, setPedidosDetalle] = usePersistentState<PedidoDetalle[]>(
    'PHARMA_PEDIDOS_DET',
    () => MOCK_PEDIDOS_DETALLE,
    leerLista
  );

  // El rol y el equipo provienen estrictamente del usuario que tiene la sesión iniciada
  const rolActual: RolUsuario = usuarioActual?.rol || 'admin';
  const equipoActual: EquipoVentas = usuarioActual?.equipo || 'TODOS';

  const tabs = useMemo(() => tabsDelRol(rolActual), [rolActual]);

  // Pestaña activa sincronizada con el hash (#/pestana): el botón "atrás" del móvil navega entre módulos.
  const [tabSolicitada, setTabSolicitada] = useState<string>(() => leerTabDelHash() || TAB_INICIAL[rolActual]);
  const tabActiva = tabs.some((t) => t.id === tabSolicitada) ? tabSolicitada : tabs[0].id;

  const irATab = useCallback((tab: string) => {
    setTabSolicitada(tab);
    if (leerTabDelHash() !== tab) window.history.pushState(null, '', `#/${tab}`);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const alNavegar = () => setTabSolicitada(leerTabDelHash() || TAB_INICIAL[rolActual]);
    window.addEventListener('popstate', alNavegar);
    return () => window.removeEventListener('popstate', alNavegar);
  }, [rolActual]);

  // Modales: solo se montan (y descargan) cuando se abren.
  const [isSupabaseConectado, setIsSupabaseConectado] = useState(() => getStoredSupabaseConfig().isConnected);
  const [modalSupabaseAbierto, setModalSupabaseAbierto] = useState(false);
  const [modalAuthAbierto, setModalAuthAbierto] = useState(false);
  const [modalEscanerAbierto, setModalEscanerAbierto] = useState(false);
  const [modalDictadoAbierto, setModalDictadoAbierto] = useState(false);
  const [modalCreditosAbierto, setModalCreditosAbierto] = useState(false);

  // Items añadidos externamente desde Escáner o Voz al borrador de pedido
  const [itemsExternosAñadidos, setItemsExternosAñadidos] = useState<ItemPedido[]>([]);

  // Aviso cuando localStorage se llena (p. ej. histórico de ventas muy grande).
  const [almacenamientoLleno, setAlmacenamientoLleno] = useState(false);
  useEffect(() => {
    const alFallar = () => setAlmacenamientoLleno(true);
    window.addEventListener(EVENTO_ERROR_ALMACENAMIENTO, alFallar);
    return () => window.removeEventListener(EVENTO_ERROR_ALMACENAMIENTO, alFallar);
  }, []);

  // Modo offline-first: base local (IndexedDB), motor de sincronización y, si hay servidor, descarga incremental.
  // Se importa después del primer render: Dexie y el motor no forman parte del bundle inicial.
  useEffect(() => {
    let detener: (() => void) | null = null;
    let cancelado = false;
    void import('./offline/arranque').then(async ({ iniciarOffline }) => {
      const crearRemoto = isSupabaseConectado
        ? async () => {
            const { crearRemotoSupabase } = await import('./offline/supabaseRemoto');
            const cliente = getSupabaseClient();
            return cliente ? crearRemotoSupabase(cliente) : null;
          }
        : null;
      const parar = await iniciarOffline(crearRemoto);
      if (cancelado) parar();
      else detener = parar;
    });
    return () => {
      cancelado = true;
      detener?.();
    };
  }, [isSupabaseConectado]);

  // Sincronización inicial desde Supabase: trae clientes, productos y droguerías (esquema v3) al modelo de las pantallas clásicas.
  // Se combina por clave natural (ident01 / SKU / código de droguería): lo que solo existe aquí se conserva y el layout de
  // exportación de cada droguería sigue siendo el local. Sin sesión iniciada, las tablas protegidas devuelven vacío y no cambia nada.
  useEffect(() => {
    if (!isSupabaseConectado) return;
    let activo = true;
    void (async () => {
      const client = getSupabaseClient();
      if (!client) return;
      try {
        const nube = await descargarCatalogosNube(client);
        if (!activo) return;
        const clientesNube = leerClientes(nube.clientes);
        if (clientesNube?.length) setClientes((prev) => fusionarPorClave(prev, clientesNube, (c) => c.ident01, 'nube'));
        const productosNube = leerProductos(nube.productos);
        if (productosNube?.length) setProductos((prev) => fusionarPorClave(prev, productosNube, (p) => p.sku, 'nube'));
        const droguriasNube = leerDroguerias(nube.droguerias);
        if (droguriasNube?.length) setDroguerias((prev) => fusionarPorClave(prev, droguriasNube, (d) => d.codigo_drogueria, 'local'));
      } catch (err) {
        console.warn('Error al recuperar catálogos desde Supabase:', err);
      }
    })();
    return () => {
      activo = false;
    };
  }, [isSupabaseConectado]);

  const handleCrearUsuario = (nuevo: Omit<Usuario, 'id' | 'created_at'> & { password?: string }) => {
    const userCreado: Usuario = {
      id: `usr-custom-${Date.now()}`,
      email: nuevo.email,
      nombre_completo: nuevo.nombre_completo,
      rol: nuevo.rol,
      equipo: nuevo.equipo,
      telefono: nuevo.telefono,
      activo: nuevo.activo,
      created_at: new Date().toISOString(),
    };
    setUsuarios((prev) => [userCreado, ...prev]);
  };

  const handleImportarClientes = (nuevos: Cliente[]) => {
    setClientes((prev) => {
      const mapa = new Map<string, Cliente>();
      prev.forEach((c) => mapa.set(c.codigo_cliente, c));
      nuevos.forEach((c) => mapa.set(c.codigo_cliente, c));
      return Array.from(mapa.values());
    });
  };

  const handleImportarProductos = (nuevos: Producto[]) => {
    setProductos((prev) => {
      const mapa = new Map<string, Producto>();
      prev.forEach((p) => mapa.set(p.sku, p));
      nuevos.forEach((p) => mapa.set(p.sku, p));
      return Array.from(mapa.values());
    });
  };

  const handleImportarHistorico = (nuevos: HistoricoPedidoPrevio[]) => {
    setHistoricoPrevio((prev) => [...nuevos, ...prev]);
  };

  const handleImportarDroguerias = (nuevas: Drogueria[]) => {
    setDroguerias((prev) => {
      const mapa = new Map<string, Drogueria>();
      prev.forEach((d) => mapa.set((d.nombre_drogueria || d.id || '').toLowerCase(), d));
      nuevas.forEach((d) => mapa.set((d.nombre_drogueria || d.id || '').toLowerCase(), d));
      return Array.from(mapa.values());
    });
  };

  const handleUsuarioAutenticado = (usuario: Usuario) => {
    setUsuarioActual(usuario);
    irATab(TAB_INICIAL[usuario.rol]);
  };

  const handleCerrarSesion = () => {
    setUsuarioActual(null);
  };

  const handleActualizarStock = (productoId: string, nuevoStock: number) => {
    setProductos((prev) =>
      prev.map((p) => (p.id === productoId ? { ...p, stock_disponible: Math.max(0, nuevoStock) } : p))
    );
  };

  const handleCrearProducto = (nuevoProd: Omit<Producto, 'id' | 'created_at'>) => {
    const nuevo: Producto = {
      ...nuevoProd,
      id: `prod-custom-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    setProductos((prev) => [nuevo, ...prev]);
  };

  const handleEditarProducto = (productoActualizado: Producto) => {
    setProductos((prev) => prev.map((p) => (p.id === productoActualizado.id ? productoActualizado : p)));
  };

  const handleEliminarProducto = (productoId: string) => {
    setProductos((prev) => prev.filter((p) => p.id !== productoId));
  };

  const handleCrearDrogueria = (nuevaDrog: Drogueria) => {
    setDroguerias((prev) => {
      const nextIdNum = prev.reduce((max, d) => Math.max(max, d.id_numero || 0), 0) + 1;
      return [...prev, { ...nuevaDrog, id_numero: nuevaDrog.id_numero || nextIdNum }];
    });
  };

  const handleEditarDrogueria = (drogueriaActualizada: Drogueria) => {
    setDroguerias((prev) => prev.map((d) => (d.id === drogueriaActualizada.id ? drogueriaActualizada : d)));
  };

  const handleEliminarDrogueria = (drogueriaId: string) => {
    setDroguerias((prev) => prev.filter((d) => d.id !== drogueriaId));
  };

  const handleCrearCliente = (nuevoCliente: Cliente) => {
    setClientes((prev) => [nuevoCliente, ...prev]);
  };

  const handleEditarCliente = (clienteActualizado: Cliente) => {
    setClientes((prev) =>
      prev.map((c) =>
        c.ident01 === clienteActualizado.ident01 || c.id === clienteActualizado.id ? clienteActualizado : c
      )
    );
  };

  const handleEliminarCliente = (clienteIdent01: string) => {
    setClientes((prev) => prev.filter((c) => c.ident01 !== clienteIdent01 && c.id !== clienteIdent01));
  };

  const handleActualizarDetalle = (
    detalleId: string,
    cantidadConfirmada: number,
    motivoAjuste: MotivoAjuste,
    observaciones?: string
  ) => {
    const original = pedidosDetalle.find((d) => d.id === detalleId);
    if (!original) return;

    const actualizado: PedidoDetalle = {
      ...original,
      cantidad_confirmada: cantidadConfirmada,
      subtotal_confirmado: Number(
        (cantidadConfirmada * original.precio_unitario * (1 - original.descuento_porcentaje / 100)).toFixed(2)
      ),
      motivo_ajuste: motivoAjuste,
      observaciones_linea: observaciones !== undefined ? observaciones : original.observaciones_linea,
    };

    let solicitado = 0;
    let confirmado = 0;
    pedidosDetalle.forEach((d) => {
      if (d.pedido_id !== original.pedido_id) return;
      const linea = d.id === detalleId ? actualizado : d;
      solicitado += linea.cantidad_solicitada;
      confirmado += linea.cantidad_confirmada;
    });
    const fillRate = solicitado > 0 ? Number(((confirmado / solicitado) * 100).toFixed(2)) : 100;

    setPedidosDetalle((prev) => prev.map((d) => (d.id === detalleId ? actualizado : d)));
    setPedidosCabecera((prev) =>
      prev.map((cab) =>
        cab.id === original.pedido_id
          ? { ...cab, total_confirmado: confirmado, fill_rate: fillRate, updated_at: new Date().toISOString() }
          : cab
      )
    );
  };

  const handleCambiarEstadoPedido = (pedidoId: string, nuevoEstado: EstadoPedido, numeroFactura?: string) => {
    const ahora = new Date().toISOString();
    setPedidosCabecera((prev) =>
      prev.map((p) =>
        p.id === pedidoId
          ? {
              ...p,
              estado: nuevoEstado,
              numero_factura: numeroFactura ?? p.numero_factura,
              transferencista_id: usuarioActual?.rol === 'teletransferencista' ? usuarioActual.id : p.transferencista_id,
              fecha_procesamiento: ahora,
              updated_at: ahora,
            }
          : p
      )
    );
  };

  /** Crea cabecera + detalle de un pedido nuevo (toma en campo o sugerido) y lo envía a teletransferencia. */
  const crearPedido = (clienteId: string, drogueriaId: string, items: ItemPedido[], observaciones: string) => {
    const ahora = new Date();
    const fechaActual = ahora.toISOString();
    const pedidoId = `ped-cab-${ahora.getTime()}`;
    const numeroPedido = `PED-${fechaActual.slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

    let totalSol = 0;
    const nuevosDetalles: PedidoDetalle[] = items.map((it, idx) => {
      const subtotal = Number((it.cantidad * it.producto.precio_lista * (1 - it.descuento / 100)).toFixed(2));
      totalSol += subtotal;
      return {
        id: `det-${pedidoId}-${idx + 1}`,
        pedido_id: pedidoId,
        producto_id: it.producto.id,
        cantidad_solicitada: it.cantidad,
        cantidad_confirmada: it.cantidad,
        precio_unitario: it.producto.precio_lista,
        descuento_porcentaje: it.descuento,
        subtotal_solicitado: subtotal,
        subtotal_confirmado: subtotal,
        motivo_ajuste: 'sin_quiebre',
        created_at: fechaActual,
      };
    });

    const nuevaCabecera: PedidoCabecera = {
      id: pedidoId,
      numero_pedido: numeroPedido,
      cliente_id: clienteId,
      vendedor_id: usuarioActual?.id || MOCK_USUARIOS[0].id,
      drogueria_id: drogueriaId,
      fecha_pedido: fechaActual,
      equipo_origen: equipoActual === 'AMBOS' ? 'A' : equipoActual,
      estado: 'enviado_teletransferencia',
      observaciones,
      total_solicitado: totalSol,
      total_confirmado: totalSol,
      fill_rate: 100.0,
      created_at: fechaActual,
      updated_at: fechaActual,
    };

    setPedidosCabecera((prev) => [nuevaCabecera, ...prev]);
    setPedidosDetalle((prev) => [...nuevosDetalles, ...prev]);
    irATab(rolActual === 'vendedor' ? 'dashboard' : 'teletransferencia');
  };

  const handleGenerarPedidoDesdeSugerido = (clienteId: string, items: ItemPedido[]) =>
    crearPedido(clienteId, droguerias[0]?.id ?? '', items, 'Generado desde el Motor de Pedido Sugerido.');

  const handleTransmitirPedido = (clienteId: string, drogueriaId: string, items: ItemPedido[], observaciones: string) =>
    crearPedido(clienteId, drogueriaId, items, observaciones || 'Pedido tomado en campo.');

  const handleActualizarInventarioDrogueria = (
    _drogueriaId: string,
    registros: { sku: string; stock: number; precioDrogueria?: number; codigoArticuloDrogueria?: string }[]
  ) => {
    const porSku = new Map(registros.map((r) => [(r.sku || '').toLowerCase(), r]));
    setProductos((prev) =>
      prev.map((prod) => {
        const reg = porSku.get((prod.sku || prod.codigo || '').toLowerCase());
        return reg
          ? { ...prod, stock_disponible: reg.stock, precio_lista: reg.precioDrogueria ?? prod.precio_lista }
          : prod;
      })
    );
  };

  const handleProductoEscaneado = (producto: Producto, cantidad: number, descuento: number) => {
    setItemsExternosAñadidos((prev) => [...prev, { producto, cantidad, descuento }]);
  };

  const handleItemsDictados = (items: ItemPedido[]) => {
    setItemsExternosAñadidos((prev) => [...prev, ...items]);
  };

  const actualizarEstadoSupabase = () => setIsSupabaseConectado(getStoredSupabaseConfig().isConnected);

  return (
    <div className="min-h-dvh flex flex-col font-sans text-slate-800 dark:text-slate-100">
      <Header
        rolActual={rolActual}
        equipoActual={equipoActual}
        isSupabaseConectado={isSupabaseConectado}
        onAbrirConfigSupabase={() => setModalSupabaseAbierto(true)}
        usuarioActual={usuarioActual}
        onAbrirAuthModal={() => setModalAuthAbierto(true)}
        onAbrirCreditos={() => setModalCreditosAbierto(true)}
        onCerrarSesion={handleCerrarSesion}
      />

      <div className="flex flex-1 min-w-0">
        <SideNav tabs={tabs} tabActiva={tabActiva} onCambiarTab={irATab} />

        <div className="flex-1 min-w-0 flex flex-col">
          {almacenamientoLleno && (
            <div
              role="alert"
              className="mx-3.5 sm:mx-6 lg:mx-8 mt-3 p-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <p className="flex-1">
                  El histórico de ventas supera los 5MB estándar de localStorage: los datos están <strong>resguardados en IndexedDB local</strong> y en memoria. Conecta Supabase para sincronizarlos en la nube.
                </p>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setModalSupabaseAbierto(true)}
                  className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs"
                >
                  {isSupabaseConectado ? 'Verificar Supabase' : 'Conectar Supabase'}
                </button>
                <button
                  type="button"
                  onClick={() => setAlmacenamientoLleno(false)}
                  aria-label="Cerrar aviso"
                  className="p-1 -m-1 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <main className="flex-1 w-full max-w-[1680px] mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 md:pb-8">
            <ErrorBoundary compacto resetKey={tabActiva}>
              <Suspense fallback={<PestanaCargando />}>
                {tabActiva === 'dashboard' && (
                  <RepDashboardTab
                    pedidos={pedidosCabecera}
                    detalles={pedidosDetalle}
                    vendedorId={rolActual === 'vendedor' ? usuarioActual?.id : undefined}
                  />
                )}

                {tabActiva === 'captura' && usuarioActual && (
                  <PedidoCapturaScreen vendedorId={usuarioActual.id} equipoId={null} />
                )}

                {tabActiva === 'nuevo_pedido' && (
                  <OrderTakingTab
                    clientes={clientes}
                    droguerias={droguerias}
                    productos={productos}
                    rolActual={rolActual}
                    equipoActual={equipoActual}
                    onAbrirEscaner={() => setModalEscanerAbierto(true)}
                    onAbrirDictadoVoz={() => setModalDictadoAbierto(true)}
                    onTransmitirPedido={handleTransmitirPedido}
                    onIrASugeridos={() => irATab('sugerido')}
                    itemsExternos={itemsExternosAñadidos}
                    onConsumirItemsExternos={() => setItemsExternosAñadidos([])}
                  />
                )}

                {tabActiva === 'sugerido' && (
                  <SuggestedOrderTab
                    clientes={clientes}
                    productos={productos}
                    historicoPrevio={historicoPrevio}
                    pedidosCabecera={pedidosCabecera}
                    pedidosDetalle={pedidosDetalle}
                    onGenerarPedidoDesdeSugerido={handleGenerarPedidoDesdeSugerido}
                  />
                )}

                {tabActiva === 'mis_pedidos' && (
                  <MyOrdersTab
                    pedidos={pedidosCabecera}
                    detalles={pedidosDetalle}
                    clientes={clientes}
                    droguerias={droguerias}
                    productos={productos}
                  />
                )}

                {tabActiva === 'teletransferencia' && (
                  <TeletransferQueueTab
                    pedidosCabecera={pedidosCabecera}
                    pedidosDetalle={pedidosDetalle}
                    clientes={clientes}
                    droguerias={droguerias}
                    productos={productos}
                    onActualizarDetalle={handleActualizarDetalle}
                    onCambiarEstadoPedido={handleCambiarEstadoPedido}
                  />
                )}

                {tabActiva === 'droguerias_csv' && (
                  <DrugstoreCsvTab
                    droguerias={droguerias}
                    pedidosCabecera={pedidosCabecera}
                    pedidosDetalle={pedidosDetalle}
                    clientes={clientes}
                    productos={productos}
                  />
                )}

                {tabActiva === 'carga_inventario' && (
                  <DrugstoreInventoryUploadTab
                    droguerias={droguerias}
                    productos={productos}
                    onActualizarInventarioDrogueria={handleActualizarInventarioDrogueria}
                  />
                )}

                {tabActiva === 'vademecum' && (
                  <InventoryCatalogTab
                    productos={productos}
                    onActualizarStock={handleActualizarStock}
                    onCrearProducto={handleCrearProducto}
                    onEditarProducto={handleEditarProducto}
                    onEliminarProducto={handleEliminarProducto}
                  />
                )}

                {tabActiva === 'usuarios' && (
                  <AdminUsersTab
                    usuarios={usuarios}
                    onCrearUsuario={handleCrearUsuario}
                    onSimularUsuario={handleUsuarioAutenticado}
                    usuarioActual={usuarioActual}
                  />
                )}

                {tabActiva === 'carga_datos' && (
                  <DataImportStudioTab
                    clientes={clientes}
                    productos={productos}
                    droguerias={droguerias}
                    historicoPrevio={historicoPrevio}
                    onImportarClientes={handleImportarClientes}
                    onEditarCliente={handleEditarCliente}
                    onEliminarCliente={handleEliminarCliente}
                    onCrearCliente={handleCrearCliente}
                    onImportarProductos={handleImportarProductos}
                    onImportarDroguerias={handleImportarDroguerias}
                    onEditarDrogueria={handleEditarDrogueria}
                    onEliminarDrogueria={handleEliminarDrogueria}
                    onCrearDrogueria={handleCrearDrogueria}
                    onEditarProducto={handleEditarProducto}
                    onEliminarProducto={handleEliminarProducto}
                    onCrearProducto={handleCrearProducto}
                    onImportarHistorico={handleImportarHistorico}
                  />
                )}

                {tabActiva === 'sql_script' && <SqlStudioTab />}

                {tabActiva === 'guia_uso' && <UserGuideTab />}
              </Suspense>
            </ErrorBoundary>
          </main>

          <footer className="hidden md:block border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-3 text-xs text-slate-500 dark:text-slate-400">
            <div className="max-w-[1680px] mx-auto px-6 lg:px-8 flex items-center justify-between gap-3">
              <span>
                <strong className="font-extrabold text-slate-800 dark:text-slate-100">NOVA</strong> v2.1 · Sistema
                Comercial &amp; Teletransferencias Farmacéuticas
              </span>
              <button
                type="button"
                onClick={() => setModalCreditosAbierto(true)}
                className="text-teal-600 dark:text-teal-400 hover:underline font-bold"
              >
                Créditos
              </button>
            </div>
          </footer>
        </div>
      </div>

      <BottomNav tabs={tabs} tabActiva={tabActiva} onCambiarTab={irATab} />

      <Suspense fallback={null}>
        {modalCreditosAbierto && <AboutModal abierto onCerrar={() => setModalCreditosAbierto(false)} />}

        {modalEscanerAbierto && (
          <BarcodeScannerModal
            abierto
            onCerrar={() => setModalEscanerAbierto(false)}
            productos={productos}
            onProductoEscaneado={handleProductoEscaneado}
          />
        )}

        {modalDictadoAbierto && (
          <VoiceDictationModal
            abierto
            onCerrar={() => setModalDictadoAbierto(false)}
            productos={productos}
            onAgregarItemsAlPedido={handleItemsDictados}
          />
        )}

        {modalAuthAbierto && (
          <AuthModal
            abierto
            onCerrar={() => setModalAuthAbierto(false)}
            usuarioActual={usuarioActual}
            onUsuarioAutenticado={handleUsuarioAutenticado}
            onCerrarSesion={handleCerrarSesion}
          />
        )}

        {modalSupabaseAbierto && (
          <SupabaseConfigModal
            abierto
            onCerrar={() => setModalSupabaseAbierto(false)}
            onConexionActualizada={actualizarEstadoSupabase}
          />
        )}
      </Suspense>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
