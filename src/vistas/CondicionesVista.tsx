import { useCallback, useMemo, useState } from 'react';
import { BadgePercent, Plus, Search, Trash2, X } from 'lucide-react';
import type { Usuario } from '../types/pharmacy';
import { Sheet } from '../components/capture/Sheet';
import { BarraSeleccion, Boton, Campo, Casilla, Etiqueta, Grupo, PageHeader, Segmentado, Subtitulo, Tarjeta, Vacio, estiloInput, useAviso, useConfirmar, useSeleccion } from '../components/ui/kit';
import { normalizarBusqueda } from '../services/maestros';
import { useProductos } from './useDatos';
import type { LocalProducto } from '../offline/types';
import { getSupabaseClient } from '../services/supabaseClient';
import { eliminarRegistros, guardarRegla, listarDrogueriasConId, listarReglas } from '../services/maestros';
import type { FilaRegla } from '../services/maestros';
import { condicionDelPedido, describirRequisitos, esDescuentoPorProducto } from '../offline/politicas';
import type { ReglaComercial } from '../offline/politicas';
import { useListaNube } from './maestros/comun';

const hoy = () => new Date().toISOString().slice(0, 10);
type Tipo = 'pedido' | 'producto';
const nueva = (tipo: Tipo): FilaRegla => ({ nombre: '', alcance: tipo === 'pedido' ? 'pedido' : 'linea', descuento_max_pct: 5, min_skus_distintos: null, min_unidades_totales: null, drogueria_id: null, productos: [], min_unidades_producto: null, vigente_desde: hoy(), vigente_hasta: null, prioridad: 100, activo: true });
const tipoDe = (r: FilaRegla): Tipo | null => (r.alcance === 'pedido' ? 'pedido' : esDescuentoPorProducto(r) ? 'producto' : null);

function estado(r: FilaRegla): { texto: string; tono: 'exito' | 'neutro' | 'aviso' } {
  if (!r.activo) return { texto: 'Pausada', tono: 'neutro' };
  if (r.vigente_hasta && r.vigente_hasta < hoy()) return { texto: 'Vencida', tono: 'neutro' };
  if (r.vigente_desde > hoy()) return { texto: `Desde ${r.vigente_desde}`, tono: 'aviso' };
  return { texto: 'Activa', tono: 'exito' };
}

/**
 * Descuentos, de dos tipos (el carrito del vendedor los aplica solos):
 *  - Por pedido: % sobre todo el pedido según cuántos productos distintos (SKU) y cuántas unidades lleva. Los mínimos se
 *    combinan y, si cumple varias condiciones, se aplica la de mayor descuento.
 *  - Por producto: % para productos elegidos, opcionalmente desde cierta cantidad de ese producto.
 */
export function CondicionesVista({ usuario }: { usuario: Usuario }) {
  const puedeEditar = usuario.rol === 'admin';
  const cargarReglas = useCallback(listarReglas, []);
  const cargarDroguerias = useCallback(listarDrogueriasConId, []);
  const { filas, cargando, error, recargar } = useListaNube(cargarReglas);
  const { filas: droguerias } = useListaNube(cargarDroguerias);
  const [edicion, setEdicion] = useState<FilaRegla | null>(null);
  const [tipo, setTipo] = useState<Tipo>('pedido');
  const productos = useProductos();
  const nombreProducto = useMemo(() => new Map(productos.map((p) => [p.id, p.nombre_comercial])), [productos]);
  const reglasProducto = filas.filter((r) => tipoDe(r) === 'producto');
  const sel = useSeleccion();
  const { mostrar, nodo } = useAviso();
  const { confirmar, nodo: nodoConfirmar } = useConfirmar();
  const reglasPedido = filas.filter((r) => r.alcance === 'pedido');
  const nombreDrogueria = useMemo(() => new Map(droguerias.map((d) => [d.id, d.nombre])), [droguerias]);

  const eliminar = async () => {
    const sb = getSupabaseClient();
    if (!sb) return;
    if (!(await confirmar(`Eliminar ${sel.cantidad} condición(es)`, 'Los pedidos nuevos dejarán de recibir ese descuento. Los pedidos ya enviados no cambian.', { accion: 'Eliminar', peligro: true }))) return;
    try {
      await eliminarRegistros(sb, 'reglas', [...sel.ids]);
      sel.limpiar();
      void recargar();
    } catch (e: unknown) {
      mostrar({ tipo: 'error', texto: e instanceof Error ? e.message : String(e) });
    }
  };

  const alternarActiva = async (r: FilaRegla) => {
    const sb = getSupabaseClient();
    if (!sb) return;
    try {
      await guardarRegla(sb, { ...r, activo: !r.activo });
      void recargar();
    } catch (e: unknown) {
      mostrar({ tipo: 'error', texto: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div>
      <PageHeader
        titulo="Descuentos"
        descripcion="Por pedido (según productos distintos y unidades) o por producto. El carrito del vendedor los aplica solos."
        acciones={puedeEditar ? <Boton variante="primario" icono={Plus} onClick={() => setEdicion(nueva(tipo))}>{tipo === 'pedido' ? 'Nuevo descuento por pedido' : 'Nuevo descuento por producto'}</Boton> : undefined}
      />
      {nodo}
      {nodoConfirmar}
      {error && <p role="alert" className="mb-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}

      <Segmentado valor={tipo} onChange={(v) => { setTipo(v); sel.limpiar(); }} opciones={[{ id: 'pedido', texto: 'Por pedido', cuenta: reglasPedido.length }, { id: 'producto', texto: 'Por producto', cuenta: reglasProducto.length }]} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          {puedeEditar && (
            <BarraSeleccion cantidad={sel.cantidad} onLimpiar={sel.limpiar}>
              <Boton tamano="sm" variante="peligro" icono={Trash2} onClick={() => void eliminar()}>Eliminar {sel.cantidad}</Boton>
            </BarraSeleccion>
          )}
          <Tarjeta className="!p-0">
            {cargando ? (
              <p className="p-6 text-center text-sm text-slate-500">Cargando…</p>
            ) : (tipo === 'pedido' ? reglasPedido : reglasProducto).length === 0 ? (
              <Vacio
                icono={BadgePercent}
                titulo={tipo === 'pedido' ? 'Todavía no hay descuentos por pedido' : 'Todavía no hay descuentos por producto'}
                texto={tipo === 'pedido' ? 'Por ejemplo: 5% desde 3 productos distintos, o 8% desde 100 unidades.' : 'Por ejemplo: 10% en Losartán 50 mg, o 5% a cada producto que lleve 10 unidades o más.'}
                accion={puedeEditar ? <Boton variante="primario" icono={Plus} onClick={() => setEdicion(nueva(tipo))}>Nuevo descuento</Boton> : undefined}
              />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {[...(tipo === 'pedido' ? reglasPedido : reglasProducto)].sort((a, b) => a.descuento_max_pct - b.descuento_max_pct).map((r) => {
                  const e = estado(r);
                  return (
                    <li key={r.id} className={`flex items-center gap-2 py-3 pl-1 pr-4 ${sel.tiene(r.id!) ? 'bg-marca-50 dark:bg-marca-950/60' : ''}`}>
                      {puedeEditar ? <Casilla etiqueta={`Seleccionar ${r.nombre}`} marcada={sel.tiene(r.id!)} onChange={() => sel.alternar(r.id!)} /> : <span className="w-3" />}
                      <span className="inline-flex h-12 w-14 shrink-0 items-center justify-center rounded-lg bg-marca-50 text-lg font-bold tabular-nums text-marca-800 dark:bg-marca-950 dark:text-marca-300">{r.descuento_max_pct}%</span>
                      <button type="button" disabled={!puedeEditar} onClick={() => setEdicion(r)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{r.nombre}</p>
                        <p className="truncate text-sm text-slate-500">
                          {tipo === 'producto' ? describirProductos(r, (id) => nombreProducto.get(id)) : describirRequisitos(r)} · {r.drogueria_id ? nombreDrogueria.get(r.drogueria_id) ?? 'Una droguería' : 'Todas las droguerías'}
                          {r.vigente_hasta ? ` · hasta ${r.vigente_hasta}` : ''}
                        </p>
                      </button>
                      <Etiqueta tono={e.tono}>{e.texto}</Etiqueta>
                      {puedeEditar && <Boton tamano="sm" variante="fantasma" onClick={() => void alternarActiva(r)}>{r.activo ? 'Pausar' : 'Activar'}</Boton>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Tarjeta>
          <p className="mt-2 text-xs text-slate-500">
            {tipo === 'pedido'
              ? 'Si un pedido cumple varias condiciones, se aplica la de mayor descuento.'
              : 'Si un producto tiene varios descuentos, se aplica el mayor. Se suma al descuento por pedido si lo hay.'}{' '}
            Un pedido con un descuento mayor al permitido va a Revisión Especial.
          </p>
        </div>
        {tipo === 'pedido' ? (
          <Simulador reglas={reglasPedido} />
        ) : (
          <Tarjeta className="self-start">
            <Subtitulo>Cómo funciona</Subtitulo>
            <p className="text-sm text-slate-600 dark:text-slate-300">El vendedor ve la oferta en el catálogo (por ejemplo “−10%” o “−15% desde 20”). Al agregar el producto al carrito, el descuento se aplica solo a esa línea.</p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Con <b>Todos los productos</b> y un mínimo (por ejemplo 10 unidades), cada producto que llegue a 10 recibe el descuento y el que lleve menos queda sin él.</p>
          </Tarjeta>
        )}
      </div>

      {edicion && (
        <FormRegla
          inicial={edicion}
          droguerias={droguerias}
          productos={productos}
          onCerrar={() => setEdicion(null)}
          onGuardada={() => { setEdicion(null); mostrar({ tipo: 'ok', texto: 'Descuento guardado. Llega a los vendedores en unos segundos.' }); void recargar(); }}
        />
      )}
    </div>
  );
}

/** Prueba las condiciones con un pedido imaginario. */
function Simulador({ reglas }: { reglas: FilaRegla[] }) {
  const [skus, setSkus] = useState(3);
  const [unidades, setUnidades] = useState(60);
  const resultado = useMemo(() => {
    const lineas = Array.from({ length: Math.max(0, skus) }, (_, i) => ({ producto_id: `p${i}`, unidades: skus > 0 ? Math.floor(unidades / skus) + (i < unidades % skus ? 1 : 0) : 0 }));
    return condicionDelPedido(reglas as ReglaComercial[], { cliente_validado: true, lineas });
  }, [reglas, skus, unidades]);
  return (
    <Tarjeta className="self-start">
      <Subtitulo>Probar con un pedido</Subtitulo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Productos distintos"><input type="number" min={0} value={skus} onChange={(e) => setSkus(Number(e.target.value))} className={estiloInput} /></Campo>
        <Campo rotulo="Unidades"><input type="number" min={0} value={unidades} onChange={(e) => setUnidades(Number(e.target.value))} className={estiloInput} /></Campo>
      </div>
      <div className="mt-4 rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
        <p className="text-xs text-slate-500">Descuento del pedido</p>
        <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{resultado.aplicada ? `${resultado.aplicada.pct}%` : '0%'}</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">{resultado.aplicada ? resultado.aplicada.regla.nombre : 'No cumple ninguna condición.'}</p>
        {resultado.siguiente && (
          <p className="mt-2 text-sm text-marca-800 dark:text-marca-300">
            Para {resultado.siguiente.regla.descuento_max_pct}%: faltan{' '}
            {[resultado.siguiente.faltantes.skus ? `${resultado.siguiente.faltantes.skus} producto(s)` : '', resultado.siguiente.faltantes.unidades ? `${resultado.siguiente.faltantes.unidades} unidades` : ''].filter(Boolean).join(' y ')}.
          </p>
        )}
      </div>
    </Tarjeta>
  );
}

/** "Losartán 50 mg, Omeprazol 20 mg y 3 más · desde 20 uds" / "Todos los productos · desde 10 uds de cada uno" */
function describirProductos(r: FilaRegla, nombre: (id: string) => string | undefined): string {
  if (r.productos.length === 0) return `Todos los productos${r.min_unidades_producto ? ` · desde ${r.min_unidades_producto} uds de cada uno` : ''}`;
  const nombres = r.productos.map((id) => nombre(id) ?? 'Producto');
  const lista = nombres.length > 2 ? `${nombres.slice(0, 2).join(', ')} y ${nombres.length - 2} más` : nombres.join(' y ');
  return `${lista || 'Sin productos'}${r.min_unidades_producto ? ` · desde ${r.min_unidades_producto} uds` : ''}`;
}

/** Buscar y marcar productos (catálogo del dispositivo). */
function ElegirProductos({ productos, valor, onChange }: { productos: LocalProducto[]; valor: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState('');
  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const resultados = useMemo(() => {
    const t = normalizarBusqueda(q);
    if (!t) return [];
    return productos.filter((p) => !valor.includes(p.id) && normalizarBusqueda(`${p.nombre_comercial} ${p.sku} ${p.principio_activo ?? ''}`).includes(t)).slice(0, 8);
  }, [q, productos, valor]);
  return (
    <div className="flex flex-col gap-2">
      {valor.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {valor.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-marca-50 py-0.5 pl-2.5 pr-1 text-sm text-marca-900 dark:bg-marca-950 dark:text-marca-100">
              {porId.get(id)?.nombre_comercial ?? 'Producto'}
              <button type="button" aria-label={`Quitar ${porId.get(id)?.nombre_comercial ?? 'producto'}`} onClick={() => onChange(valor.filter((x) => x !== id))} className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-marca-100 dark:hover:bg-marca-900"><X className="h-3.5 w-3.5" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto por nombre, código o molécula" aria-label="Buscar producto" className={`${estiloInput} pl-9`} />
      </div>
      {resultados.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {resultados.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => { onChange([...valor, p.id]); setQ(''); }} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                <span className="min-w-0 truncate text-slate-900 dark:text-white">{p.nombre_comercial}</span>
                <span className="shrink-0 text-xs text-slate-500">{p.sku}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FormRegla({ inicial, droguerias, productos, onCerrar, onGuardada }: { inicial: FilaRegla; droguerias: { id: string; nombre: string }[]; productos: LocalProducto[]; onCerrar: () => void; onGuardada: () => void }) {
  const [r, setR] = useState(inicial);
  const porProducto = tipoDe(inicial) === 'producto' || (inicial.alcance === 'linea' && !inicial.id);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  // Por producto: a unos productos elegidos, o a todos los que lleguen a un mínimo de unidades cada uno.
  const [aTodos, setATodos] = useState(!!inicial.id && inicial.alcance === 'linea' && inicial.productos.length === 0);
  const numero = (v: string) => (v.trim() === '' ? null : Math.max(1, Math.round(Number(v)) || 1));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabaseClient();
    if (!sb) return;
    if (!(r.descuento_max_pct > 0 && r.descuento_max_pct <= 100)) return setError('El descuento debe estar entre 0,01% y 100%.');
    if (r.vigente_hasta && r.vigente_hasta < r.vigente_desde) return setError('La fecha final no puede ser anterior a la inicial.');
    if (porProducto && aTodos && !r.min_unidades_producto) return setError('Indica desde cuántas unidades de cada producto aplica.');
    if (porProducto && !aTodos && r.productos.length === 0) return setError('Elige al menos un producto.');
    const productosFinal = porProducto && aTodos ? [] : r.productos;
    const nombre =
      r.nombre.trim() ||
      (porProducto
        ? aTodos
          ? `${r.descuento_max_pct}% a cada producto desde ${r.min_unidades_producto} uds`
          : `${r.descuento_max_pct}% en ${r.productos.length} producto${r.productos.length === 1 ? '' : 's'}`
        : `${r.descuento_max_pct}% ${describirRequisitos(r).toLowerCase()}`);
    setGuardando(true);
    try {
      await guardarRegla(sb, porProducto ? { ...r, nombre, productos: productosFinal, alcance: 'linea', min_skus_distintos: null, min_unidades_totales: null } : { ...r, nombre, alcance: 'pedido', productos: [], min_unidades_producto: null });
      onGuardada();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Sheet abierto titulo={`${inicial.id ? 'Editar' : 'Nuevo'} descuento ${porProducto ? 'por producto' : 'por pedido'}`} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo={porProducto ? 'Descuento del producto (%)' : 'Descuento del pedido (%)'}><input type="number" step="0.5" min={0} max={100} required value={r.descuento_max_pct} onChange={(e) => setR({ ...r, descuento_max_pct: Number(e.target.value) })} className={estiloInput} /></Campo>
        <Campo rotulo="Nombre" ayuda="Opcional: se arma solo."><input value={r.nombre} onChange={(e) => setR({ ...r, nombre: e.target.value })} placeholder={porProducto ? 'Ej. Promo Losartán' : 'Ej. Escala 5%'} className={estiloInput} /></Campo>
        {porProducto ? (
          <>
            <Grupo rotulo="Aplica a" className="sm:col-span-2">
              <Segmentado valor={aTodos ? 'todos' : 'elegidos'} onChange={(v) => setATodos(v === 'todos')} opciones={[{ id: 'elegidos', texto: 'Productos elegidos' }, { id: 'todos', texto: 'Todos los productos' }]} />
            </Grupo>
            {!aTodos && <Grupo rotulo="Productos con descuento" className="sm:col-span-2"><ElegirProductos productos={productos} valor={r.productos} onChange={(v) => setR({ ...r, productos: v })} /></Grupo>}
            <Campo
              rotulo={aTodos ? 'Mínimo de unidades de cada producto' : 'Desde cuántas unidades del producto'}
              ayuda={aTodos ? 'Obligatorio. Cada producto (SKU) que llegue a este mínimo recibe el descuento; los que no, quedan sin él.' : 'Vacío = desde 1 unidad.'}
              className="sm:col-span-2"
            >
              <input type="number" min={1} value={r.min_unidades_producto ?? ''} onChange={(e) => setR({ ...r, min_unidades_producto: numero(e.target.value) })} className={estiloInput} />
            </Campo>
          </>
        ) : (
          <>
            <Campo rotulo="Mínimo de productos distintos (SKU)" ayuda="Vacío = no se exige."><input type="number" min={1} value={r.min_skus_distintos ?? ''} onChange={(e) => setR({ ...r, min_skus_distintos: numero(e.target.value) })} className={estiloInput} /></Campo>
            <Campo rotulo="Mínimo de unidades del pedido" ayuda="Vacío = no se exige."><input type="number" min={1} value={r.min_unidades_totales ?? ''} onChange={(e) => setR({ ...r, min_unidades_totales: numero(e.target.value) })} className={estiloInput} /></Campo>
          </>
        )}
        <Campo rotulo="Droguería" className="sm:col-span-2">
          <select value={r.drogueria_id ?? ''} onChange={(e) => setR({ ...r, drogueria_id: e.target.value || null })} className={estiloInput}>
            <option value="">Todas las droguerías</option>
            {droguerias.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Vigente desde"><input type="date" required value={r.vigente_desde} onChange={(e) => setR({ ...r, vigente_desde: e.target.value })} className={estiloInput} /></Campo>
        <Campo rotulo="Vigente hasta" ayuda="Vacío = sin fecha de fin."><input type="date" value={r.vigente_hasta ?? ''} onChange={(e) => setR({ ...r, vigente_hasta: e.target.value || null })} className={estiloInput} /></Campo>
        <label className="inline-flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={r.activo} onChange={(e) => setR({ ...r, activo: e.target.checked })} className="h-4 w-4 accent-marca-700" /> Activa</label>
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 sm:col-span-2 dark:bg-slate-950 dark:text-slate-300">
          {porProducto ? (
            aTodos ? (
              <><b>{r.descuento_max_pct || 0}%</b> a cada producto del pedido que lleve {r.min_unidades_producto || '…'} unidades o más. Ejemplo: 3 productos de {r.min_unidades_producto || 10} uds y 1 de {Math.max(1, Math.floor((r.min_unidades_producto || 10) / 2))} → el descuento va solo a los 3 primeros.</>
            ) : (
              <><b>{r.descuento_max_pct || 0}%</b> en {r.productos.length} producto{r.productos.length === 1 ? '' : 's'}{r.min_unidades_producto ? `, desde ${r.min_unidades_producto} unidades de cada uno` : ''}. Se aplica solo en esas líneas del pedido.</>
            )
          ) : (
            <><b>{r.descuento_max_pct || 0}%</b> de descuento · {describirRequisitos(r).toLowerCase()}. Si defines los dos mínimos, el pedido debe cumplir ambos; para que baste uno solo, crea dos descuentos.</>
          )}
        </p>
        {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300 sm:col-span-2">{error}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton type="submit" variante="primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
        </div>
      </form>
    </Sheet>
  );
}
