import { useMemo } from 'react';
import { BadgePercent, BookmarkPlus, Plus, Send, ShoppingCart, Trash2, X } from 'lucide-react';
import { CodigoFarmacia } from './CodigoFarmacia';
import { Avatar, Boton, BotonIcono, Campo, Etiqueta, PasoUnidades, Vacio, estiloInput } from '../components/ui/kit';
import { condicionDelPedido, descuentosPorProducto } from '../offline/politicas';
import type { ReglaComercial } from '../offline/politicas';
import type { LocalCliente, LocalDrogueria, LocalProducto } from '../offline/types';
import { faltaParaEnviar, totales } from './carritos';
import type { AccionCarritos, Carrito, EstadoCarritos } from './carritos';
import { contextoCarrito } from './useCarritos';

interface Props {
  estado: EstadoCarritos;
  dispatch: (a: AccionCarritos) => void;
  clientes: Map<string, LocalCliente>;
  productos: Map<string, LocalProducto>;
  droguerias: LocalDrogueria[];
  reglas: ReglaComercial[];
  enviando: boolean;
  onEnviar: (carritos: Carrito[]) => void;
  onNuevaFarmacia: () => void;
  /** Código de la farmacia en la droguería (null si falta). */
  codigoDe: (cliente_id: string, drogueria_id: string | null) => string | null;
  onGuardarCodigo: (cliente_id: string, drogueria_id: string, codigo: string) => Promise<void>;
  /** Guardar el carrito activo como plantilla de esa farmacia. */
  onGuardarPlantilla?: (carrito: Carrito) => void;
}

/** Los carritos abiertos (uno por farmacia) y el detalle del activo. */
export function PanelCarrito({ estado, dispatch, clientes, productos, droguerias, reglas, enviando, onEnviar, onNuevaFarmacia, codigoDe, onGuardarCodigo, onGuardarPlantilla }: Props) {
  const activo = estado.carritos.find((c) => c.id === estado.activo) ?? null;
  const listos = estado.carritos.filter((c) => faltaParaEnviar(c, !!codigoDe(c.cliente_id, c.drogueria_id)).length === 0);

  if (estado.carritos.length === 0) {
    return (
      <Vacio
        icono={ShoppingCart}
        titulo="Tu carrito está vacío"
        texto="Elige una farmacia y agrega productos del catálogo, o dicta el pedido con el micrófono."
        accion={<Boton variante="primario" icono={Plus} onClick={onNuevaFarmacia}>Elegir farmacia</Boton>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Un carrito por farmacia */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {estado.carritos.map((c) => {
          const t = totales(c);
          const esActivo = c.id === estado.activo;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => dispatch({ tipo: 'activar', id: c.id })}
              aria-pressed={esActivo}
              className={`flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-left text-sm ${esActivo ? 'border-marca-700 bg-marca-50 text-marca-900 dark:border-marca-400 dark:bg-marca-950 dark:text-marca-100' : 'border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'}`}
            >
              <span className="max-w-36 truncate font-medium">{clientes.get(c.cliente_id)?.nombre_comercial ?? 'Farmacia'}</span>
              <span className="rounded-full bg-slate-100 px-1.5 text-xs tabular-nums dark:bg-slate-800">{t.unidades}</span>
            </button>
          );
        })}
        <Boton tamano="sm" variante="fantasma" icono={Plus} onClick={onNuevaFarmacia} className="shrink-0">Farmacia</Boton>
      </div>

      {activo && (
        <DetalleCarrito
          carrito={activo}
          dispatch={dispatch}
          cliente={clientes.get(activo.cliente_id)}
          productos={productos}
          droguerias={droguerias}
          reglas={reglas}
          enviando={enviando}
          onEnviar={() => onEnviar([activo])}
          codigo={codigoDe(activo.cliente_id, activo.drogueria_id)}
          onGuardarCodigo={(codigo) => onGuardarCodigo(activo.cliente_id, activo.drogueria_id!, codigo)}
          onGuardarPlantilla={onGuardarPlantilla ? () => onGuardarPlantilla(activo) : undefined}
        />
      )}

      {listos.length > 1 && (
        <Boton variante="primario" icono={Send} disabled={enviando} onClick={() => onEnviar(listos)} className="w-full">
          Enviar los {listos.length} pedidos listos
        </Boton>
      )}
    </div>
  );
}

function DetalleCarrito({ carrito: c, dispatch, cliente, productos, droguerias, reglas, enviando, onEnviar, codigo, onGuardarCodigo, onGuardarPlantilla }: {
  carrito: Carrito;
  dispatch: (a: AccionCarritos) => void;
  cliente: LocalCliente | undefined;
  productos: Map<string, LocalProducto>;
  droguerias: LocalDrogueria[];
  reglas: ReglaComercial[];
  enviando: boolean;
  onEnviar: () => void;
  codigo: string | null;
  onGuardarCodigo: (codigo: string) => Promise<void>;
  onGuardarPlantilla?: () => void;
}) {
  const t = totales(c);
  const faltas = faltaParaEnviar(c, !!codigo);
  const drogueria = droguerias.find((d) => d.id === c.drogueria_id);
  const contexto = useMemo(() => contextoCarrito(c, productos, cliente), [c, productos, cliente]);
  const condicion = useMemo(() => condicionDelPedido(reglas, contexto), [reglas, contexto]);
  const porProducto = useMemo(() => descuentosPorProducto(reglas, contexto), [reglas, contexto]);

  return (
    <section aria-label={`Carrito de ${cliente?.nombre_comercial ?? 'la farmacia'}`} className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar nombre={cliente?.nombre_comercial ?? '?'} tamano={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{cliente?.nombre_comercial ?? 'Farmacia'}</p>
          <p className="text-xs text-slate-500">{t.productos} producto{t.productos === 1 ? '' : 's'} · {t.unidades} unidades</p>
        </div>
        <BotonIcono icono={Trash2} etiqueta="Quitar este carrito" onClick={() => dispatch({ tipo: 'quitar', carrito_id: c.id })} />
      </div>

      <Campo rotulo="Droguería">
        <select value={c.drogueria_id ?? ''} onChange={(e) => dispatch({ tipo: 'drogueria', carrito_id: c.id, drogueria_id: e.target.value || null })} className={estiloInput}>
          <option value="">Elige la droguería</option>
          {droguerias.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select>
      </Campo>
      {c.drogueria_id && (codigo ? (
        <p className="-mt-1 text-xs text-slate-500">Código de la farmacia en {drogueria?.nombre ?? 'la droguería'}: <span className="font-medium text-slate-700 dark:text-slate-200">{codigo}</span></p>
      ) : (
        <CodigoFarmacia farmacia={cliente?.nombre_comercial ?? 'la farmacia'} drogueria={drogueria?.nombre ?? 'la droguería'} onGuardar={onGuardarCodigo} />
      ))}

      {c.lineas.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-3 text-center text-sm text-slate-500 dark:bg-slate-950">Agrega productos del catálogo.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {c.lineas.map((l) => {
            const p = productos.get(l.producto_id);
            const paso = Math.max(1, p?.empaque_minimo ?? 1);
            return (
              <li key={l.producto_id} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{p?.nombre_comercial ?? 'Producto'}</p>
                  <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
                    {porProducto.get(l.producto_id) && <Etiqueta tono="exito">−{porProducto.get(l.producto_id)!.pct}%</Etiqueta>}
                    <span className="truncate">{p?.presentacion ?? p?.sku}</span>
                  </p>
                </div>
                <PasoUnidades valor={l.unidades} onChange={(n) => dispatch({ tipo: 'unidades', carrito_id: c.id, producto_id: l.producto_id, unidades: n })} paso={paso} min={0} compacto etiqueta={`Unidades de ${p?.nombre_comercial ?? 'producto'}`} />
                <BotonIcono icono={X} etiqueta={`Quitar ${p?.nombre_comercial ?? 'producto'}`} onClick={() => dispatch({ tipo: 'unidades', carrito_id: c.id, producto_id: l.producto_id, unidades: 0 })} className="!h-8 !w-8" />
              </li>
            );
          })}
        </ul>
      )}

      {(condicion.aplicada || condicion.siguiente) && (
        <div className="flex gap-2 rounded-lg bg-marca-50 p-3 text-sm text-marca-900 dark:bg-marca-950 dark:text-marca-100">
          <BadgePercent className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            {condicion.aplicada ? <p><b>{condicion.aplicada.pct}% de descuento</b> · {condicion.aplicada.regla.nombre}</p> : <p>Aún sin descuento.</p>}
            {condicion.siguiente && (
              <p className="text-marca-800 dark:text-marca-300">
                Agrega {[condicion.siguiente.faltantes.skus ? `${condicion.siguiente.faltantes.skus} producto${condicion.siguiente.faltantes.skus === 1 ? '' : 's'} más` : '', condicion.siguiente.faltantes.unidades ? `${condicion.siguiente.faltantes.unidades} unidades más` : ''].filter(Boolean).join(' y ')} para {condicion.siguiente.regla.descuento_max_pct}%.
              </p>
            )}
          </div>
        </div>
      )}

      <Campo rotulo="Nota para la droguería (opcional)">
        <input value={c.observaciones} onChange={(e) => dispatch({ tipo: 'observaciones', carrito_id: c.id, texto: e.target.value })} className={estiloInput} />
      </Campo>

      {onGuardarPlantilla && c.lineas.length > 0 && (
        <Boton variante="fantasma" tamano="sm" icono={BookmarkPlus} onClick={onGuardarPlantilla} className="self-start">Guardar como plantilla</Boton>
      )}

      {cliente && cliente.estado_validacion !== 'activo' && <p className="text-xs text-amber-800 dark:text-amber-300">Farmacia por validar: el pedido irá a revisión de la mesa.</p>}
      <Boton variante="primario" icono={Send} disabled={faltas.length > 0 || enviando} onClick={onEnviar} className="w-full" title={faltas.join(' · ')}>
        {enviando ? 'Enviando…' : faltas.length ? faltas[0] : 'Enviar pedido'}
      </Boton>
    </section>
  );
}
