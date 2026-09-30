import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { Cliente, Drogueria, HistoricoPedidoPrevio, Producto, Usuario } from '../types/pharmacy';
import { MOCK_CLIENTES, MOCK_DROGUERIAS, MOCK_HISTORICO_PREVIO, MOCK_PRODUCTOS } from '../data/mockData';
import { getSupabaseClient } from '../services/supabaseClient';
import {
  descargarCatalogosNube, eliminarClienteNube, eliminarDrogueriaNube, eliminarProductoNube, fusionarPorClave,
  guardarDroguerias, importarCatalogoClientes, importarCatalogoProductos,
} from '../services/nubeV3';
import { leerClientes, leerDroguerias, leerLista, leerProductos } from '../services/storageMigrations';
import { borrarClavesLocales, usePersistentState } from '../hooks/usePersistentState';
import { Boton, PageHeader, Segmentado, Vacio, useAviso } from '../components/ui/kit';
import { consumirSeccion } from './navegacion';
import { Fichero } from './datos/Fichero';
import { Pendientes } from './datos/Pendientes';

const DataImportStudioTab = lazy(() => import('../components/DataImportStudioTab').then((m) => ({ default: m.DataImportStudioTab })));

type Seccion = 'cargar' | 'fichero' | 'pendientes';
const SECCIONES = ['cargar', 'fichero', 'pendientes'] as const;

const CLAVES_ANTIGUAS = ['PHARMA_PEDIDOS_CAB', 'PHARMA_PEDIDOS_DET', 'PHARMA_USUARIOS', 'PHARMA_BORRADOR_LOCAL'];

/**
 * ¿Este registro es uno de los datos de ejemplo que trae la aplicación? Solo si viene de la semilla (mismo id y misma
 * fecha de creación): una droguería real llamada igual que un ejemplo (COBECA, NENA...) cargada desde archivo NO lo es.
 */
const deSemilla = (a: { id: string; created_at: string }, b: { id: string; created_at: string }) => a.id === b.id && a.created_at === b.created_at;
const esEjemploCliente = (c: Cliente) => MOCK_CLIENTES.some((m) => deSemilla(m, c));
const esEjemploProducto = (p: Producto) => MOCK_PRODUCTOS.some((m) => deSemilla(m, p));
const esEjemploDrogueria = (d: Drogueria) => MOCK_DROGUERIAS.some((m) => deSemilla(m, d));

/** Administración de datos: cargar y editar catálogos/histórico, asignar el fichero de cada vendedor y resolver pendientes de homologación. */
export function DatosVista({ usuario, esDemo }: { usuario: Usuario; esDemo: boolean }) {
  const [seccion, setSeccion] = useState<Seccion>(() => consumirSeccion('datos', SECCIONES, 'cargar'));
  const { mostrar, nodo } = useAviso();

  // Con la nube conectada no se siembran datos de ejemplo: lo que se ve es lo que se cargó.
  const [productos, setProductos] = usePersistentState<Producto[]>('PHARMA_PRODUCTOS', () => (esDemo ? MOCK_PRODUCTOS : []), leerProductos);
  const [clientes, setClientes] = usePersistentState<Cliente[]>('PHARMA_CLIENTES', () => (esDemo ? MOCK_CLIENTES : []), leerClientes);
  const [droguerias, setDroguerias] = usePersistentState<Drogueria[]>('PHARMA_DROGUERIAS_V2', () => (esDemo ? MOCK_DROGUERIAS : []), leerDroguerias);
  const [historicoPrevio, setHistoricoPrevio] = usePersistentState<HistoricoPedidoPrevio[]>('PHARMA_HISTORICO', () => (esDemo ? MOCK_HISTORICO_PREVIO : []), leerLista);

  useEffect(() => { void borrarClavesLocales(CLAVES_ANTIGUAS); }, []);

  // Trae los catálogos de la nube al abrir (combinados por clave natural: lo local pendiente de subir no se pierde;
  // el layout de exportación de cada droguería sigue siendo el local).
  useEffect(() => {
    const sb = getSupabaseClient();
    if (esDemo || !sb) return;
    let vivo = true;
    void descargarCatalogosNube(sb).then((nube) => {
      if (!vivo) return;
      const c = leerClientes(nube.clientes);
      if (c?.length) setClientes((prev) => fusionarPorClave(prev, c, (x) => x.ident01, 'nube'));
      const p = leerProductos(nube.productos);
      if (p?.length) setProductos((prev) => fusionarPorClave(prev, p, (x) => x.sku, 'nube'));
      const d = leerDroguerias(nube.droguerias);
      if (d?.length) setDroguerias((prev) => fusionarPorClave(prev, d, (x) => x.codigo_drogueria, 'local'));
    }).catch((e) => console.warn('Catálogos desde Supabase:', e));
    return () => { vivo = false; };
  }, [esDemo, setClientes, setProductos, setDroguerias]);

  /** Sube a la nube un cambio hecho en pantalla; si falla se avisa y el cambio queda guardado en este navegador. */
  const aNube = useCallback(async (accion: (sb: NonNullable<ReturnType<typeof getSupabaseClient>>) => Promise<unknown>, ok: string) => {
    const sb = getSupabaseClient();
    if (esDemo || !sb) return;
    try {
      await accion(sb);
      mostrar({ tipo: 'ok', texto: ok });
    } catch (e) {
      mostrar({ tipo: 'error', texto: `Guardado aquí, pero no se pudo subir a la nube: ${e instanceof Error ? e.message : String(e)}` });
    }
  }, [esDemo, mostrar]);

  const importar = <T,>(setter: (f: (p: T[]) => T[]) => void, clave: (x: T) => string) => (nuevos: T[]) =>
    setter((prev) => { const m = new Map<string, T>(); prev.forEach((x) => m.set(clave(x), x)); nuevos.forEach((x) => m.set(clave(x), x)); return [...m.values()]; });

  const hayEjemplos = !esDemo && (clientes.some(esEjemploCliente) || productos.some(esEjemploProducto) || droguerias.some(esEjemploDrogueria) || historicoPrevio.some((h) => MOCK_HISTORICO_PREVIO.some((m) => m.id === h.id)));
  const quitarEjemplos = () => {
    setClientes((p) => p.filter((c) => !esEjemploCliente(c)));
    setProductos((p) => p.filter((x) => !esEjemploProducto(x)));
    setDroguerias((p) => p.filter((d) => !esEjemploDrogueria(d)));
    setHistoricoPrevio((p) => p.filter((h) => !MOCK_HISTORICO_PREVIO.some((m) => m.id === h.id)));
    mostrar({ tipo: 'ok', texto: 'Datos de ejemplo quitados de este navegador.' });
  };

  if (usuario.rol !== 'admin') return <Vacio titulo="Solo para administradores" />;

  return (
    <div>
      <PageHeader titulo="Cargar y editar datos" descripcion="Catálogos, historial de ventas, ficheros de vendedores y homologación." />
      {nodo}
      {hayEjemplos && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <span>Este navegador tiene datos de ejemplo que no son tuyos. Quítalos antes de subir a la nube.</span>
          <Boton onClick={quitarEjemplos}>Quitar datos de ejemplo</Boton>
        </div>
      )}
      <Segmentado opciones={[{ id: 'cargar', texto: 'Cargar y editar' }, { id: 'fichero', texto: 'Fichero de vendedores' }, { id: 'pendientes', texto: 'Pendientes de homologar' }]} valor={seccion} onChange={setSeccion} />

      {seccion === 'cargar' && (
        <Suspense fallback={<p className="p-4 text-sm text-slate-500">Cargando…</p>}>
          <DataImportStudioTab
            clientes={clientes}
            productos={productos}
            droguerias={droguerias}
            historicoPrevio={historicoPrevio}
            onImportarClientes={importar<Cliente>(setClientes, (c) => c.codigo_cliente)}
            onImportarProductos={importar<Producto>(setProductos, (p) => p.sku)}
            onImportarDroguerias={importar<Drogueria>(setDroguerias, (d) => (d.nombre_drogueria || d.id).toLowerCase())}
            onImportarHistorico={(nuevos) => setHistoricoPrevio((prev) => [...nuevos, ...prev])}
            onCrearCliente={(c) => { setClientes((p) => [c, ...p]); void aNube((sb) => importarCatalogoClientes(sb, [c]), `${c.nombre_fantasia} guardada.`); }}
            onEditarCliente={(c) => { setClientes((p) => p.map((x) => (x.ident01 === c.ident01 || x.id === c.id ? c : x))); void aNube((sb) => importarCatalogoClientes(sb, [c]), `${c.nombre_fantasia} actualizada.`); }}
            onEliminarCliente={(ident) => { setClientes((p) => p.filter((c) => c.ident01 !== ident && c.id !== ident)); void aNube((sb) => eliminarClienteNube(sb, ident), 'Farmacia eliminada.'); }}
            onCrearProducto={(n) => { const p: Producto = { ...n, id: `prod-${Date.now()}`, created_at: new Date().toISOString() }; setProductos((prev) => [p, ...prev]); void aNube((sb) => importarCatalogoProductos(sb, [p]), `${p.nombre_comercial} guardado.`); }}
            onEditarProducto={(p) => { setProductos((prev) => prev.map((x) => (x.id === p.id ? p : x))); void aNube((sb) => importarCatalogoProductos(sb, [p]), `${p.nombre_comercial} actualizado.`); }}
            onEliminarProducto={(id) => { const p = productos.find((x) => x.id === id); setProductos((prev) => prev.filter((x) => x.id !== id)); if (p) void aNube((sb) => eliminarProductoNube(sb, p.codigo || p.sku), 'Producto eliminado.'); }}
            onCrearDrogueria={(d) => { setDroguerias((prev) => [...prev, { ...d, id_numero: d.id_numero || prev.reduce((m, x) => Math.max(m, x.id_numero || 0), 0) + 1 }]); void aNube((sb) => guardarDroguerias(sb, [d]), `${d.nombre_drogueria} guardada.`); }}
            onEditarDrogueria={(d) => { setDroguerias((prev) => prev.map((x) => (x.id === d.id ? d : x))); void aNube((sb) => guardarDroguerias(sb, [d]), `${d.nombre_drogueria} actualizada.`); }}
            onEliminarDrogueria={(id) => { const d = droguerias.find((x) => x.id === id); setDroguerias((prev) => prev.filter((x) => x.id !== id)); if (d) void aNube((sb) => eliminarDrogueriaNube(sb, d.codigo_drogueria), 'Droguería eliminada.'); }}
          />
        </Suspense>
      )}
      {seccion === 'fichero' && <Fichero />}
      {seccion === 'pendientes' && <Pendientes />}
    </div>
  );
}
