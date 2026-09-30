import { useMemo, useState } from 'react';
import { Pill, Search, Truck } from 'lucide-react';
import type { Usuario } from '../types/pharmacy';
import { Sheet } from '../components/capture/Sheet';
import { Etiqueta, PageHeader, Segmentado, Tarjeta, Vacio, estiloInput, useDebounced } from '../components/ui/kit';
import { normalizar } from '../offline/busqueda';
import { useDroguerias, useMapClientes, useMapProductos, useProductos } from './useDatos';

const POR_PAGINA = 80;

/** Consulta de productos y droguerías (solo lectura; se editan en "Cargar y editar datos"). */
export function CatalogoVista({ usuario }: { usuario: Usuario }) {
  const [seccion, setSeccion] = useState<'productos' | 'droguerias'>('productos');
  return (
    <div>
      <PageHeader titulo="Catálogo" descripcion={usuario.rol === 'admin' ? 'Para modificarlo, ve a "Cargar y editar datos".' : 'Productos y droguerías.'} />
      <Segmentado opciones={[{ id: 'productos', texto: 'Productos' }, { id: 'droguerias', texto: 'Droguerías' }]} valor={seccion} onChange={setSeccion} />
      {seccion === 'productos' ? <Productos /> : <Droguerias />}
    </div>
  );
}

function Productos() {
  const productos = useProductos();
  const droguerias = useDroguerias();
  const map = useMapProductos();
  const [texto, setTexto] = useState('');
  const q = useDebounced(texto, 150);
  const [categoria, setCategoria] = useState('');
  const [limite, setLimite] = useState(POR_PAGINA);
  const [abierto, setAbierto] = useState<string | null>(null);

  const categorias = useMemo(() => Array.from(new Set(productos.map((p) => p.categoria).filter((c): c is string => !!c))).sort(), [productos]);
  const lista = useMemo(() => {
    const t = normalizar(q);
    return productos
      .filter((p) => p.activo)
      .filter((p) => !categoria || p.categoria === categoria)
      .filter((p) => !t || p.tokens.some((k) => k.startsWith(t)) || normalizar(p.sku).includes(t) || (p.ean13 ?? '').includes(t) || normalizar(p.nombre_comercial).includes(t))
      .sort((a, b) => a.nombre_comercial.localeCompare(b.nombre_comercial));
  }, [productos, q, categoria]);
  const actual = abierto ? productos.find((p) => p.id === abierto) : undefined;
  const codigos = actual ? map.filter((m) => m.producto_id === actual.id) : [];

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={texto} onChange={(e) => { setTexto(e.target.value); setLimite(POR_PAGINA); }} placeholder="Nombre, principio activo, SKU o código de barras" aria-label="Buscar producto" className={`${estiloInput} pl-9`} />
        </div>
        {categorias.length > 0 && (
          <select value={categoria} onChange={(e) => { setCategoria(e.target.value); setLimite(POR_PAGINA); }} aria-label="Categoría" className={`${estiloInput} w-auto`}>
            <option value="">Todas las categorías</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      <Tarjeta className="!p-0">
        {lista.length === 0 ? (
          <Vacio icono={Pill} titulo={productos.length === 0 ? 'El catálogo está vacío' : 'Sin resultados'} texto={productos.length === 0 ? 'Cárgalo desde "Cargar y editar datos".' : undefined} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {lista.slice(0, limite).map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setAbierto(p.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{p.nombre_comercial}</p>
                    <p className="truncate text-xs text-slate-500">{[p.sku, p.presentacion, p.laboratorio].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {p.es_prioritario && <Etiqueta tono="teal">Prioritario</Etiqueta>}
                    <span className="text-xs text-slate-400">x{p.empaque_minimo}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {lista.length > limite && <div className="border-t border-slate-100 p-2 text-center dark:border-slate-800"><button type="button" className="text-sm font-semibold text-marca-700 dark:text-marca-300" onClick={() => setLimite((l) => l + POR_PAGINA)}>Ver más ({lista.length - limite})</button></div>}
      </Tarjeta>

      <Sheet abierto={!!actual} titulo={actual?.nombre_comercial ?? ''} onCerrar={() => setAbierto(null)}>
        {actual && (
          <div className="space-y-3 text-sm">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              {[['SKU (Cod SAP)', actual.sku], ['Código de barras', actual.ean13], ['Presentación', actual.presentacion], ['Principio activo', actual.principio_activo], ['Laboratorio', actual.laboratorio], ['Categoría', actual.categoria], ['Empaque mínimo', `x${actual.empaque_minimo}`]]
                .filter(([, v]) => v).map(([k, v]) => <div key={k as string} className="min-w-0"><dt className="text-slate-500">{k}</dt><dd className="truncate font-semibold">{v}</dd></div>)}
            </dl>
            <section>
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Código en cada droguería</h3>
              {codigos.length === 0 ? <p className="text-xs text-slate-500">Todavía no está homologado con ninguna droguería.</p> : (
                <ul className="space-y-1 text-xs">
                  {codigos.map((m) => (
                    <li key={m.id} className="flex justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/60">
                      <span className="font-semibold">{droguerias.find((d) => d.id === m.drogueria_id)?.nombre ?? 'Droguería'}{m.es_principal === false ? ' (otro código)' : ''}</span>
                      <span className="font-mono">{m.codigo_drogueria}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </Sheet>
    </>
  );
}

function Droguerias() {
  const droguerias = useDroguerias();
  const mapP = useMapProductos();
  const mapC = useMapClientes();
  const [abierta, setAbierta] = useState<string | null>(null);

  return (
    <Tarjeta className="!p-0">
      {droguerias.length === 0 ? (
        <Vacio icono={Truck} titulo="No hay droguerías" texto='Se cargan desde "Cargar y editar datos".' />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {droguerias.sort((a, b) => a.nombre.localeCompare(b.nombre)).map((d) => {
            const f = d.formato_export;
            const abiertaAqui = abierta === d.id;
            return (
              <li key={d.id}>
                <button type="button" onClick={() => setAbierta(abiertaAqui ? null : d.id)} aria-expanded={abiertaAqui} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{d.nombre}</p>
                    <p className="truncate text-xs text-slate-500">{d.codigo} · {mapP.filter((m) => m.drogueria_id === d.id).length} productos y {mapC.filter((m) => m.drogueria_id === d.id).length} farmacias homologadas</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Etiqueta>{f.formato.toUpperCase()}{f.delimitador ? ` · ${f.delimitador === '\t' ? 'tab' : f.delimitador}` : ' · fijo'}</Etiqueta>
                    {!d.activo && <Etiqueta tono="gris">Inactiva</Etiqueta>}
                  </div>
                </button>
                {abiertaAqui && (
                  <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800/40">
                    <p className="mb-1 font-semibold text-slate-600 dark:text-slate-300">Columnas del archivo de pedido ({f.codificacion}, {f.encabezado ? 'con' : 'sin'} encabezado)</p>
                    <ol className="flex flex-wrap gap-1.5">
                      {f.columnas.map((c, i) => <li key={i} className="rounded-lg bg-white px-2 py-1 font-mono dark:bg-slate-900">{i + 1}. {c.encabezado || c.origen}</li>)}
                    </ol>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Tarjeta>
  );
}
