import React from 'react';
import { AlertTriangle, BookmarkPlus, Info, Minus, Plus, Send, Trash2, WifiOff } from 'lucide-react';
import { describirFaltantes, topeDescuentoLinea } from '../../offline/politicas';
import type { ContextoPedido, EstadoRegla, EvaluacionPedido, ReglaComercial } from '../../offline/politicas';
import type { LocalCliente } from '../../offline/types';
import type { AccionCarrito, EstadoCarrito } from './useCarrito';

interface Props {
  carrito: EstadoCarrito;
  dispatch: React.Dispatch<AccionCarrito>;
  cliente: LocalCliente | undefined;
  reglas: ReglaComercial[];
  contexto: ContextoPedido;
  evaluacion: EvaluacionPedido;
  condiciones: EstadoRegla[];
  online: boolean;
  guardando: boolean;
  onEnviar: () => void;
  onBorrador: () => void;
  onPlantilla: () => void;
}

const boton = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 active:scale-95 dark:bg-slate-800 dark:text-slate-200';

/** Contenido del carrito: líneas, condiciones comerciales, observaciones y acciones. Sin decoración innecesaria. */
export const CarritoPanel: React.FC<Props> = ({ carrito, dispatch, cliente, reglas, contexto, evaluacion, condiciones, online, guardando, onEnviar, onBorrador, onPlantilla }) => {
  const unidades = carrito.lineas.reduce((a, l) => a + l.unidades, 0);
  const excedidos = new Map(evaluacion.violaciones.filter((v) => v.producto_id).map((v) => [v.producto_id!, v]));
  const vacio = carrito.lineas.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-slate-500">
          <strong className="font-mono text-base text-slate-900 dark:text-white">{carrito.lineas.length}</strong> productos ·{' '}
          <strong className="font-mono text-base text-slate-900 dark:text-white">{unidades}</strong> uds
        </p>
        {!vacio && (
          <button type="button" onClick={() => dispatch({ tipo: 'vaciar_lineas' })} className="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-rose-600">
            <Trash2 className="h-4 w-4" /> Vaciar
          </button>
        )}
      </div>

      {vacio ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
          Busca un producto, escanea un empaque o usa el sugerido para empezar.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {carrito.lineas.map((l) => {
            const tope = topeDescuentoLinea(reglas, contexto, { producto_id: l.producto.id, categoria: l.producto.categoria, unidades: l.unidades });
            const fuera = excedidos.has(l.producto.id);
            const paso = Math.max(1, l.producto.empaque_minimo);
            const noMultiplo = l.unidades % paso !== 0;
            return (
              <li key={l.producto.id} className="space-y-2 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900 dark:text-white">{l.producto.nombre_comercial}</p>
                    <p className="truncate text-xs text-slate-500">{l.producto.presentacion ?? l.producto.sku}</p>
                  </div>
                  <button type="button" aria-label={`Quitar ${l.producto.nombre_comercial}`} onClick={() => dispatch({ tipo: 'quitar', productoId: l.producto.id })} className="-mr-2 -mt-1 inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-400">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button type="button" aria-label="Restar" className={boton} onClick={() => dispatch({ tipo: 'unidades', productoId: l.producto.id, unidades: l.unidades - paso })}>
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      aria-label={`Unidades de ${l.producto.nombre_comercial}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={l.unidades}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => dispatch({ tipo: 'unidades', productoId: l.producto.id, unidades: parseInt(e.target.value, 10) || 0 })}
                      className="h-11 w-16 rounded-xl border border-slate-200 bg-white text-center font-mono text-lg font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <button type="button" aria-label="Sumar" className={boton} onClick={() => dispatch({ tipo: 'unidades', productoId: l.producto.id, unidades: l.unidades + paso })}>
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500">
                    Dscto
                    <input
                      aria-label={`Descuento de ${l.producto.nombre_comercial}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step="0.5"
                      value={l.descuento_pct || ''}
                      placeholder="0"
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => dispatch({ tipo: 'descuento', productoId: l.producto.id, pct: parseFloat(e.target.value) || 0 })}
                      className={`h-11 w-16 rounded-xl border bg-white text-center font-mono font-bold focus:outline-none focus:ring-2 dark:bg-slate-800 ${
                        fuera ? 'border-amber-400 text-amber-700 focus:ring-amber-400 dark:text-amber-300' : 'border-slate-200 text-slate-900 focus:ring-teal-500 dark:border-slate-700 dark:text-white'
                      }`}
                    />
                    %
                  </label>
                </div>
                {(fuera || noMultiplo) && (
                  <p className={`text-xs ${fuera ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500'}`}>
                    {fuera ? `Tope actual ${tope}%: irá a Revisión Especial.` : `Se despacha por empaque de ${paso}.`}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!vacio && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Condición comercial</legend>
          <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 ${carrito.condicion_id === null ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/30' : 'border-slate-200 dark:border-slate-700'}`}>
            <input type="radio" name="condicion" className="h-4 w-4 accent-teal-600" checked={carrito.condicion_id === null} onChange={() => dispatch({ tipo: 'condicion', id: null })} />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Sin condición especial</span>
          </label>
          {condiciones.map(({ regla, aplica, faltantes }) => (
            <label key={regla.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 ${carrito.condicion_id === regla.id ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/30' : 'border-slate-200 dark:border-slate-700'}`}>
              <input
                type="radio"
                name="condicion"
                className="h-4 w-4 accent-teal-600"
                checked={carrito.condicion_id === regla.id}
                onChange={() => {
                  dispatch({ tipo: 'condicion', id: regla.id });
                  if (aplica && regla.alcance === 'linea') dispatch({ tipo: 'descuento_todas', pct: regla.descuento_max_pct });
                  if (aplica && regla.alcance === 'pedido') dispatch({ tipo: 'descuento_pedido', pct: regla.descuento_max_pct });
                }}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {regla.nombre} <span className="font-mono text-teal-700 dark:text-teal-300">· hasta {regla.descuento_max_pct}%</span>
                </span>
                <span className={`block text-xs ${aplica ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'}`}>{describirFaltantes(faltantes)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">Observaciones</span>
        <textarea
          rows={2}
          value={carrito.observaciones}
          onChange={(e) => dispatch({ tipo: 'observaciones', texto: e.target.value })}
          placeholder="Notas para el transferencista"
          className="w-full rounded-xl border border-slate-200 bg-white p-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
      </label>

      {evaluacion.requiere_revision_especial && (
        <div role="alert" className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Este pedido irá a Revisión Especial</p>
            <ul className="mt-1 list-inside list-disc text-xs">
              {evaluacion.violaciones.map((v, i) => (
                <li key={i}>
                  {v.tipo === 'descuento_pedido_excedido' ? 'Descuento del pedido' : v.sku ?? 'Línea'}: {v.descuento}% (máx. {v.maximo}%)
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {cliente && cliente.estado_validacion !== 'activo' && (
        <div className="flex gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Farmacia pendiente de validación: el pedido queda retenido hasta que se verifique su RIF y se homologue con una droguería.</p>
        </div>
      )}

      {/* Acciones siempre a la vista: quedan pegadas al fondo de la hoja / del panel al hacer scroll. */}
      <div className="sticky bottom-0 -mx-4 -mb-4 space-y-2 border-t border-slate-100 bg-white px-4 pb-4 pt-3 dark:border-slate-800 dark:bg-slate-900">
        <button type="button" disabled={vacio || guardando} onClick={onEnviar} className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-teal-600 text-base font-bold text-white shadow-sm active:scale-[0.99] disabled:opacity-40">
          <Send className="h-5 w-5" /> Enviar pedido
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={vacio || guardando} onClick={onBorrador} className="min-h-12 rounded-xl bg-slate-100 text-sm font-bold text-slate-800 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-100">
            Guardar borrador
          </button>
          <button type="button" disabled={vacio} onClick={onPlantilla} className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-slate-100 text-sm font-bold text-slate-800 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-100">
            <BookmarkPlus className="h-4 w-4" /> Plantilla
          </button>
        </div>
        {!online && (
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-amber-700 dark:text-amber-300">
            <WifiOff className="h-3.5 w-3.5" /> Sin conexión: se guarda en el dispositivo y se envía solo.
          </p>
        )}
      </div>
    </div>
  );
};
