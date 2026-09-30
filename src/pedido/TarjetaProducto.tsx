import { memo, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { Avatar, Boton, Etiqueta, PasoUnidades } from '../components/ui/kit';
import type { LocalProducto } from '../offline/types';

/** Producto del catálogo: foto (o iniciales), datos, cuántas unidades y "Agregar" al carrito del cliente activo. */
export const TarjetaProducto = memo(function TarjetaProducto({
  producto: p,
  enCarrito,
  sugerido,
  loCompra,
  onAgregar,
}: {
  producto: LocalProducto;
  /** Unidades de este producto que ya lleva el carrito activo. */
  enCarrito: number;
  /** Unidades sugeridas para este cliente (si hay). */
  sugerido?: number;
  loCompra?: boolean;
  onAgregar: (unidades: number) => void;
}) {
  const paso = Math.max(1, p.empaque_minimo);
  const [unidades, setUnidades] = useState(sugerido && sugerido > 0 ? sugerido : paso);
  return (
    <article className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <Avatar nombre={p.nombre_comercial} foto={p.foto_url} tamano={64} cuadrado />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 dark:text-white">{p.nombre_comercial}</h3>
          <p className="truncate text-xs text-slate-500">{[p.presentacion, p.sku].filter(Boolean).join(' · ')}</p>
          {(p.es_prioritario || loCompra || sugerido) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {sugerido ? <Etiqueta tono="marca">Sugerido: {sugerido}</Etiqueta> : null}
              {loCompra && !sugerido && <Etiqueta tono="neutro">Lo compra</Etiqueta>}
              {p.es_prioritario && <Etiqueta tono="aviso">Prioritario</Etiqueta>}
            </div>
          )}
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-2">
          <PasoUnidades valor={unidades} onChange={setUnidades} paso={paso} min={paso} compacto etiqueta={`Unidades de ${p.nombre_comercial}`} />
          <Boton tamano="sm" variante={enCarrito ? 'secundario' : 'primario'} icono={Plus} onClick={() => onAgregar(unidades)} aria-label={`Agregar ${unidades} de ${p.nombre_comercial}`}>
            Agregar
          </Boton>
        </div>
        {enCarrito > 0 && (
          <p className="flex items-center gap-1 text-xs font-medium text-marca-700 dark:text-marca-300"><Check className="h-3.5 w-3.5" aria-hidden /> En el carrito: {enCarrito}</p>
        )}
      </div>
    </article>
  );
});
