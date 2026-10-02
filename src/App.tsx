import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EquipoVentas, RolUsuario, Usuario } from './types/pharmacy';
import { Header } from './components/Header';
import { SideNav, BottomNav } from './components/shell/Navigation';
import { etiquetaRol, tabsDelRol, TAB_INICIAL } from './components/shell/navConfig';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginGate } from './components/acceso/LoginGate';
import { getStoredSupabaseConfig } from './services/supabaseConfig';
import { getSupabaseClient } from './services/supabaseClient';
import { cerrarSesionNube, restaurarSesionNube } from './services/sesion';
import { leerUsuario } from './services/storageMigrations';
import { ThemeProvider } from './context/ThemeContext';
import { usePersistentState } from './hooks/usePersistentState';
import { obtenerEstadoSync } from './offline/syncStore';
import { AvisoVersion, marcarVersionVista } from './components/version/Version';
import { vigilarVersionPublicada } from './pwa/versionPublicada';
import { EVENTO_ABRIR_GUIA, debeVerGuia, recordarGuiaVista } from './components/guia/estadoGuia';

// Cada módulo se descarga solo cuando se usa (el bundle inicial se reduce a la estructura).
const Inicio = lazy(() => import('./vistas/Inicio').then((m) => ({ default: m.Inicio })));
const TiendaVista = lazy(() => import('./pedido/TiendaVista').then((m) => ({ default: m.TiendaVista })));
const ClientesVista = lazy(() => import('./vistas/ClientesVista').then((m) => ({ default: m.ClientesVista })));
const PedidosVista = lazy(() => import('./vistas/PedidosVista').then((m) => ({ default: m.PedidosVista })));
const PorProcesarVista = lazy(() => import('./vistas/PorProcesarVista').then((m) => ({ default: m.PorProcesarVista })));
const CatalogoVista = lazy(() => import('./vistas/CatalogoVista').then((m) => ({ default: m.CatalogoVista })));
const ReportesVista = lazy(() => import('./vistas/ReportesVista').then((m) => ({ default: m.ReportesVista })));
const DatosVista = lazy(() => import('./vistas/DatosVista').then((m) => ({ default: m.DatosVista })));
const CondicionesVista = lazy(() => import('./vistas/CondicionesVista').then((m) => ({ default: m.CondicionesVista })));
const ComunicadosVista = lazy(() => import('./comunicados/ComunicadosVista').then((m) => ({ default: m.ComunicadosVista })));
const RutaVista = lazy(() => import('./ruta/RutaVista').then((m) => ({ default: m.RutaVista })));
const MetasVista = lazy(() => import('./metas/MetasVista').then((m) => ({ default: m.MetasVista })));
const MedicosVista = lazy(() => import('./crm/MedicosVista').then((m) => ({ default: m.MedicosVista })));
const TareasVista = lazy(() => import('./crm/TareasVista').then((m) => ({ default: m.TareasVista })));
const ActividadesVista = lazy(() => import('./actividades/ActividadesVista').then((m) => ({ default: m.ActividadesVista })));
const CiclosVista = lazy(() => import('./ciclos/CiclosVista').then((m) => ({ default: m.CiclosVista })));
const AvisoPendientes = lazy(() => import('./components/AvisoPendientes').then((m) => ({ default: m.AvisoPendientes })));
const AvisosLocales = lazy(() => import('./avisos/AvisosLocales').then((m) => ({ default: m.AvisosLocales })));
const BannerComunicados = lazy(() => import('./comunicados/BannerComunicados').then((m) => ({ default: m.BannerComunicados })));
const ConfigVista = lazy(() => import('./vistas/config/ConfigVista').then((m) => ({ default: m.ConfigVista })));
const GuiaBienvenida = lazy(() => import('./components/guia/GuiaBienvenida').then((m) => ({ default: m.GuiaBienvenida })));

const leerTabDelHash = () => window.location.hash.replace(/^#\/?/, '');

const Cargando = () => (
  <div role="status" className="animate-pulse space-y-3" aria-busy="true" aria-label="Cargando">
    <div className="h-7 w-56 rounded-lg bg-slate-200 dark:bg-slate-800" />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-20 rounded-xl bg-slate-200 dark:bg-slate-800" />
      ))}
    </div>
    <div className="h-56 rounded-xl bg-slate-200 dark:bg-slate-800" />
  </div>
);

function AppContent() {
  const [conectado, setConectado] = useState(() => getStoredSupabaseConfig().isConnected);
  // Sin sesión no hay datos: no existe un usuario por defecto. La cuenta guardada solo evita volver a escribir la contraseña.
  const [usuarioActual, setUsuarioActual] = usePersistentState<Usuario | null>('PHARMA_AUTH_USER', () => null, leerUsuario);
  const [verificando, setVerificando] = useState(true);
  const usuarioAlAbrir = useRef(usuarioActual);

  // ¿Hay una versión publicada más nueva que la de este equipo? (aviso arriba y en el menú)
  useEffect(() => vigilarVersionPublicada(), []);

  // Guía de bienvenida: sola en el primer inicio de sesión; desde Ayuda, cuando se pida.
  const [guiaAbierta, setGuiaAbierta] = useState(false);
  const usuarioIdGuia = usuarioActual?.id;
  useEffect(() => {
    if (verificando || !usuarioActual) return;
    if (debeVerGuia(usuarioActual)) setGuiaAbierta(true);
    // Solo al entrar (o al terminar de verificar la sesión), no en cada cambio del perfil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioIdGuia, verificando]);
  useEffect(() => {
    const abrir = () => setGuiaAbierta(true);
    window.addEventListener(EVENTO_ABRIR_GUIA, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_GUIA, abrir);
  }, []);
  const cerrarGuia = useCallback(() => {
    setGuiaAbierta(false);
    if (!usuarioActual) return;
    recordarGuiaVista(usuarioActual.id);
    marcarVersionVista();
    if (!usuarioActual.guia_vista_en) {
      setUsuarioActual({ ...usuarioActual, guia_vista_en: new Date().toISOString() });
      const sb = getSupabaseClient();
      // Queda en la base: no vuelve a salir en otro teléfono o computadora. Sin la columna (SQL anterior) no pasa nada.
      if (sb && usuarioActual.id !== 'demo') void Promise.resolve(sb.rpc('marcar_guia_vista')).catch(() => undefined);
    }
  }, [usuarioActual, setUsuarioActual]);

  // Al abrir: la cuenta guardada debe seguir vigente en Supabase (y activa). Sin red se conserva y la base de datos decide al sincronizar.
  useEffect(() => {
    const guardado = usuarioAlAbrir.current;
    if (!guardado) return setVerificando(false);
    if (!conectado || guardado.id === 'demo') {
      // Modo demostración solo sin nube; con nube configurada, la demostración no sirve.
      if (conectado !== (guardado.id !== 'demo')) setUsuarioActual(null);
      return setVerificando(false);
    }
    let vivo = true;
    void restaurarSesionNube().then((r) => {
      if (!vivo) return;
      if (r.estado === 'ok') setUsuarioActual(r.usuario);
      else if (r.estado === 'sin_sesion') setUsuarioActual(null);
      setVerificando(false);
    });
    return () => {
      vivo = false;
    };
  }, [conectado, setUsuarioActual]);

  // Si Supabase cierra la sesión (contraseña cambiada, token vencido sin renovación), se vuelve al acceso.
  useEffect(() => {
    if (!conectado) return;
    const { data } = getSupabaseClient()?.auth.onAuthStateChange((evento) => evento === 'SIGNED_OUT' && setUsuarioActual(null)) ?? { data: null };
    return () => data?.subscription.unsubscribe();
  }, [conectado, setUsuarioActual]);

  const rolActual: RolUsuario = usuarioActual?.rol ?? 'vendedor';
  const equipoActual: EquipoVentas = usuarioActual?.equipo ?? 'TODOS';
  const esDemo = !conectado;
  const tabs = useMemo(() => tabsDelRol(rolActual), [rolActual]);

  // Módulo activo sincronizado con el hash (#/clientes): el botón "atrás" del móvil navega entre módulos.
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

  // Modo offline-first: base local (IndexedDB), motor de sincronización y, si hay servidor, descarga incremental.
  // Arranca al iniciar sesión y se detiene al salir; se importa después del primer render (Dexie no va en el bundle inicial).
  const usuarioId = usuarioActual?.id;
  useEffect(() => {
    if (!usuarioId) return;
    let detener: (() => void) | null = null;
    // Si la pantalla se desmonta antes de terminar de arrancar (o cambia la sesión), ese arranque se descarta.
    const control = new AbortController();
    void import('./offline/arranque').then(async ({ iniciarOffline }) => {
      const crearRemoto = conectado
        ? async () => {
            const { crearRemotoSupabase } = await import('./offline/supabaseRemoto');
            const cliente = getSupabaseClient();
            return cliente ? crearRemotoSupabase(cliente) : null;
          }
        : null;
      const parar = await iniciarOffline(crearRemoto, usuarioId, control.signal);
      if (control.signal.aborted) parar();
      else detener = parar;
    });
    return () => {
      control.abort();
      detener?.();
    };
  }, [conectado, usuarioId]);

  const handleEntrar = (u: Usuario) => {
    setUsuarioActual(u);
    setTabSolicitada(TAB_INICIAL[u.rol]);
    window.history.replaceState(null, '', `#/${TAB_INICIAL[u.rol]}`);
  };

  const handleCerrarSesion = async () => {
    const pendientes = obtenerEstadoSync().pendientes;
    if (pendientes > 0 && !window.confirm(`Tienes ${pendientes} cambio(s) sin enviar. Si cierras sesión ahora y entra otra persona en este dispositivo, se perderán. ¿Cerrar sesión de todos modos?`)) return;
    await cerrarSesionNube();
    setUsuarioActual(null);
  };

  if (verificando) return <div className="min-h-dvh p-6"><Cargando /></div>;
  if (!usuarioActual) return <LoginGate onEntrar={handleEntrar} onConexionCambiada={() => setConectado(getStoredSupabaseConfig().isConnected)} />;

  return (
    <div className="flex min-h-dvh font-sans text-slate-800 dark:text-slate-100">
      <SideNav tabs={tabs} tabActiva={tabActiva} onCambiarTab={irATab} nombre={usuarioActual.nombre_completo} rol={etiquetaRol(rolActual, equipoActual)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header rolActual={rolActual} equipoActual={equipoActual} usuarioActual={usuarioActual} esDemo={esDemo} onAbrirConfig={() => irATab('config')} onCerrarSesion={handleCerrarSesion} titulo={tabs.find((t) => t.id === tabActiva)?.label} />

        <main className="mx-auto w-full min-w-0 max-w-[1500px] flex-1 px-3 py-4 pb-24 sm:px-5 md:pb-8 lg:px-7 lg:py-6">
          <AvisoVersion guiaAbierta={guiaAbierta} />
          <ErrorBoundary compacto>
            <Suspense fallback={null}>
              {!esDemo && <AvisoPendientes />}
              <AvisosLocales usuarioId={usuarioActual.id} rol={rolActual} />
              <BannerComunicados />
            </Suspense>
          </ErrorBoundary>
          <ErrorBoundary compacto resetKey={tabActiva}>
            <Suspense fallback={<Cargando />}>
              {tabActiva === 'inicio' && <Inicio usuario={usuarioActual} irATab={irATab} />}
              {tabActiva === 'captura' && <TiendaVista vendedorId={usuarioActual.id} equipoId={null} />}
              {tabActiva === 'clientes' && <ClientesVista usuario={usuarioActual} irATab={irATab} />}
              {tabActiva === 'pedidos' && <PedidosVista usuario={usuarioActual} />}
              {tabActiva === 'por_procesar' && <PorProcesarVista usuario={usuarioActual} irATab={irATab} />}
              {tabActiva === 'catalogo' && <CatalogoVista usuario={usuarioActual} />}
              {tabActiva === 'reportes' && <ReportesVista usuario={usuarioActual} />}
              {tabActiva === 'condiciones' && <CondicionesVista usuario={usuarioActual} />}
              {tabActiva === 'metas' && <MetasVista usuario={usuarioActual} />}
              {tabActiva === 'medicos' && <MedicosVista usuario={usuarioActual} />}
              {tabActiva === 'tareas' && <TareasVista usuario={usuarioActual} />}
              {tabActiva === 'ciclos' && <CiclosVista usuario={usuarioActual} />}
              {tabActiva === 'actividades' && <ActividadesVista usuario={usuarioActual} />}
              {tabActiva === 'ruta' && <RutaVista usuario={usuarioActual} irATab={irATab} />}
              {tabActiva === 'comunicados' && <ComunicadosVista />}
              {tabActiva === 'datos' && <DatosVista usuario={usuarioActual} esDemo={esDemo} />}
              {tabActiva === 'config' && (
                <ConfigVista usuario={usuarioActual} irATab={irATab} esDemo={esDemo} onCerrarSesion={handleCerrarSesion} onConexionCambiada={() => setConectado(getStoredSupabaseConfig().isConnected)} onUsuarioActualizado={setUsuarioActual} />
              )}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <BottomNav tabs={tabs} tabActiva={tabActiva} onCambiarTab={irATab} />
      {guiaAbierta && (
        <ErrorBoundary compacto>
          <Suspense fallback={null}>
            <GuiaBienvenida usuario={usuarioActual} onCerrar={cerrarGuia} />
          </Suspense>
        </ErrorBoundary>
      )}
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
