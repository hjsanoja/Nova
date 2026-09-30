import { useCallback, useMemo, useState } from 'react';
import { BadgePercent, Plus, Trash2 } from 'lucide-react';
import type { Usuario } from '../types/pharmacy';
import { Sheet } from '../components/capture/Sheet';
import { BarraSeleccion, Boton, Campo, Casilla, Etiqueta, PageHeader, Subtitulo, Tarjeta, Vacio, estiloInput, useAviso, useConfirmar, useSeleccion } from '../components/ui/kit';
import { getSupabaseClient } from '../services/supabaseClient';
import { eliminarRegistros, guardarRegla, listarDrogueriasConId, listarReglas } from '../services/maestros';
import type { FilaRegla } from '../services/maestros';
import { condicionDelPedido, describirRequisitos } from '../offline/politicas';
import type { ReglaComercial } from '../offline/politicas';
import { useListaNube } from './maestros/comun';

const hoy = () => new Date().toISOString().slice(0, 10);
const nueva = (): FilaRegla => ({ nombre: '', alcance: 'pedido', descuento_max_pct: 5, min_skus_distintos: null, min_unidades_totales: null, drogueria_id: null, vigente_desde: hoy(), vigente_hasta: null, prioridad: 100, activo: true });

function estado(r: FilaRegla): { texto: string; tono: 'exito' | 'neutro' | 'aviso' } {
  if (!r.activo) return { texto: 'Pausada', tono: 'neutro' };
  if (r.vigente_hasta && r.vigente_hasta < hoy()) return { texto: 'Vencida', tono: 'neutro' };
  if (r.vigente_desde > hoy()) return { texto: `Desde ${r.vigente_desde}`, tono: 'aviso' };
  return { texto: 'Activa', tono: 'exito' };
}

/**
 * Condiciones comerciales: qué % de descuento recibe un pedido según cuántos productos distintos (SKU) y cuántas
 * unidades lleva. Los criterios se combinan (deben cumplirse todos los que se definan) y, si un pedido cumple varias
 * condiciones, se aplica la de mayor descuento. El carrito del vendedor lo calcula solo y le dice cuánto le falta.
 */
export function CondicionesVista({ usuario }: { usuario: Usuario }) {
  const puedeEditar = usuario.rol === 'admin';
  const cargarReglas = useCallback(listarReglas, []);
  const cargarDroguerias = useCallback(listarDrogueriasConId, []);
  const { filas, cargando, error, recargar } = useListaNube(cargarReglas);
  const { filas: droguerias } = useListaNube(cargarDroguerias);
  const [edicion, setEdicion] = useState<FilaRegla | null>(null);
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
        titulo="Condiciones comerciales"
        descripcion="Descuento automático del pedido según productos distintos y unidades."
        acciones={puedeEditar ? <Boton variante="primario" icono={Plus} onClick={() => setEdicion(nueva())}>Nueva condición</Boton> : undefined}
      />
      {nodo}
      {nodoConfirmar}
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}

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
            ) : reglasPedido.length === 0 ? (
              <Vacio icono={BadgePercent} titulo="Todavía no hay condiciones" texto="Crea la primera: por ejemplo, 5% de descuento desde 3 productos distintos, o 8% desde 100 unidades." accion={puedeEditar ? <Boton variante="primario" icono={Plus} onClick={() => setEdicion(nueva())}>Nueva condición</Boton> : undefined} />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {[...reglasPedido].sort((a, b) => a.descuento_max_pct - b.descuento_max_pct).map((r) => {
                  const e = estado(r);
                  return (
                    <li key={r.id} className={`flex items-center gap-2 py-3 pl-1 pr-4 ${sel.tiene(r.id!) ? 'bg-marca-50 dark:bg-marca-950/60' : ''}`}>
                      {puedeEditar ? <Casilla etiqueta={`Seleccionar ${r.nombre}`} marcada={sel.tiene(r.id!)} onChange={() => sel.alternar(r.id!)} /> : <span className="w-3" />}
                      <span className="inline-flex h-12 w-14 shrink-0 items-center justify-center rounded-lg bg-marca-50 text-lg font-bold tabular-nums text-marca-800 dark:bg-marca-950 dark:text-marca-300">{r.descuento_max_pct}%</span>
                      <button type="button" disabled={!puedeEditar} onClick={() => setEdicion(r)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{r.nombre}</p>
                        <p className="truncate text-sm text-slate-500">
                          {describirRequisitos(r)} · {r.drogueria_id ? nombreDrogueria.get(r.drogueria_id) ?? 'Una droguería' : 'Todas las droguerías'}
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
          <p className="mt-2 text-xs text-slate-500">Si un pedido cumple varias condiciones, se aplica la de mayor descuento. Un pedido con un descuento mayor al permitido va a Revisión Especial.</p>
        </div>
        <Simulador reglas={reglasPedido} />
      </div>

      {edicion && (
        <FormRegla
          inicial={edicion}
          droguerias={droguerias}
          onCerrar={() => setEdicion(null)}
          onGuardada={() => { setEdicion(null); mostrar({ tipo: 'ok', texto: 'Condición guardada. Llega a los vendedores en la próxima sincronización.' }); void recargar(); }}
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

function FormRegla({ inicial, droguerias, onCerrar, onGuardada }: { inicial: FilaRegla; droguerias: { id: string; nombre: string }[]; onCerrar: () => void; onGuardada: () => void }) {
  const [r, setR] = useState(inicial);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const numero = (v: string) => (v.trim() === '' ? null : Math.max(1, Math.round(Number(v)) || 1));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabaseClient();
    if (!sb) return;
    if (!(r.descuento_max_pct > 0 && r.descuento_max_pct <= 100)) return setError('El descuento debe estar entre 0,01% y 100%.');
    if (r.vigente_hasta && r.vigente_hasta < r.vigente_desde) return setError('La fecha final no puede ser anterior a la inicial.');
    const nombre = r.nombre.trim() || `${r.descuento_max_pct}% ${describirRequisitos(r).toLowerCase()}`;
    setGuardando(true);
    try {
      await guardarRegla(sb, { ...r, nombre, alcance: 'pedido' });
      onGuardada();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Sheet abierto titulo={inicial.id ? 'Editar condición' : 'Nueva condición'} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Descuento del pedido (%)"><input type="number" step="0.5" min={0} max={100} required value={r.descuento_max_pct} onChange={(e) => setR({ ...r, descuento_max_pct: Number(e.target.value) })} className={estiloInput} /></Campo>
        <Campo rotulo="Nombre" ayuda="Opcional: se arma solo."><input value={r.nombre} onChange={(e) => setR({ ...r, nombre: e.target.value })} placeholder="Ej. Escala 5%" className={estiloInput} /></Campo>
        <Campo rotulo="Mínimo de productos distintos (SKU)" ayuda="Vacío = no se exige."><input type="number" min={1} value={r.min_skus_distintos ?? ''} onChange={(e) => setR({ ...r, min_skus_distintos: numero(e.target.value) })} className={estiloInput} /></Campo>
        <Campo rotulo="Mínimo de unidades del pedido" ayuda="Vacío = no se exige."><input type="number" min={1} value={r.min_unidades_totales ?? ''} onChange={(e) => setR({ ...r, min_unidades_totales: numero(e.target.value) })} className={estiloInput} /></Campo>
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
          <b>{r.descuento_max_pct || 0}%</b> de descuento · {describirRequisitos(r).toLowerCase()}. Si defines los dos mínimos, el pedido debe cumplir ambos; para que baste uno solo, crea dos condiciones.
        </p>
        {error && <p role="alert" className="text-sm text-rose-700 sm:col-span-2">{error}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton type="submit" variante="primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
        </div>
      </form>
    </Sheet>
  );
}
