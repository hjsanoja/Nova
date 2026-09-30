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
  oferta,
  onAgregar,
}: {
  producto: LocalProducto;
  /** Unidades de este producto que ya lleva el carrito activo. */
  enCarrito: number;
  /** Unidades sugeridas para este cliente (si hay). */
  sugerido?: number;
  loCompra?: boolean;
  /** Descuento por producto vigente (se aplica solo en el carrito). */
  oferta?: { pct: number; desde: number | null } | null;
  onAgregar: (unidades: number) => void;
}) {
  // Siempre arranca en 1 unidad; el vendedor la cambia. El sugerido se usa tocando su etiqueta.
  const [unidades, setUnidades] = useState(1);
  return (
    <article className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <Avatar nombre={p.nombre_comercial} foto={p.foto_url} tamano={64} cuadrado />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 dark:text-white">{p.nombre_comercial}</h3>
          <p className="truncate text-xs text-slate-500">{[p.presentacion, p.sku, p.empaque_minimo > 1 ? `Empaque x${p.empaque_minimo}` : null].filter(Boolean).join(' · ')}</p>
          {(p.es_prioritario || loCompra || sugerido || oferta) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {oferta && <Etiqueta tono="exito">−{oferta.pct}%{oferta.desde ? ` desde ${oferta.desde}` : ''}</Etiqueta>}
              {sugerido ? (
                <button type="button" onClick={() => setUnidades(sugerido)} title="Usar las unidades sugeridas" className="rounded-full focus-visible:outline-2 focus-visible:outline-marca-600">
                  <Etiqueta tono="marca">Sugerido: {sugerido}</Etiqueta>
                </button>
              ) : null}
              {loCompra && !sugerido && <Etiqueta tono="neutro">Lo compra</Etiqueta>}
              {p.es_prioritario && <Etiqueta tono="aviso">Prioritario</Etiqueta>}
            </div>
          )}
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-2">
          <PasoUnidades valor={unidades} onChange={setUnidades} paso={1} min={1} compacto etiqueta={`Unidades de ${p.nombre_comercial}`} />
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
