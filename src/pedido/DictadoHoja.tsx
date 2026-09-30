import { useMemo, useState } from 'react';
import { Mic, MicOff, RotateCcw, ShoppingCart, Wand2 } from 'lucide-react';
import { Sheet } from '../components/capture/Sheet';
import { Avatar, Boton, Campo, Casilla, Etiqueta, PasoUnidades, estiloInput } from '../components/ui/kit';
import type { LocalCliente, LocalProducto } from '../offline/types';
import { interpretarDictado } from './dictado';
import type { PedidoDictado } from './dictado';
import { useDictado } from './useDictado';
import { SelectorCliente } from './SelectorCliente';

interface LineaVista { incluir: boolean; producto_id: string; unidades: number; texto: string; opciones: LocalProducto[]; confianza: number }

/**
 * Pedido por voz: el vendedor dice la farmacia, los productos y las unidades; NOVA muestra una vista previa para
 * confirmar o corregir y lo agrega al carrito de esa farmacia. Si el navegador no permite dictar, se escribe la frase.
 */
export function DictadoHoja({ abierto, clientes, productos, clienteActual, conCarrito, onCerrar, onConfirmar }: {
  abierto: boolean;
  clientes: LocalCliente[];
  productos: LocalProducto[];
  /** Farmacia del carrito activo: se usa si el dictado no nombra ninguna. */
  clienteActual: LocalCliente | undefined;
  conCarrito: Set<string>;
  onCerrar: () => void;
  onConfirmar: (cliente: LocalCliente, lineas: { producto_id: string; unidades: number }[]) => void;
}) {
  const voz = useDictado();
  const [vista, setVista] = useState<{ cliente: LocalCliente | null; alternativas: LocalCliente[]; lineas: LineaVista[] } | null>(null);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  const interpretar = () => {
    if (voz.escuchando) voz.detener();
    const r: PedidoDictado<LocalCliente, LocalProducto> = interpretarDictado(voz.texto, clientes, productos);
    setVista({
      cliente: r.cliente ?? clienteActual ?? null,
      alternativas: r.alternativasCliente,
      lineas: r.lineas.map((l) => ({
        incluir: !!l.producto,
        producto_id: l.producto?.id ?? '',
        unidades: l.unidades,
        texto: l.texto,
        opciones: [...(l.producto ? [l.producto] : []), ...l.alternativas],
        confianza: l.confianza,
      })),
    });
  };

  const cerrar = () => {
    voz.detener();
    voz.setTexto('');
    setVista(null);
    onCerrar();
  };

  const cambiarLinea = (i: number, parche: Partial<LineaVista>) =>
    setVista((v) => (v ? { ...v, lineas: v.lineas.map((l, k) => (k === i ? { ...l, ...parche } : l)) } : v));

  const aAgregar = vista?.lineas.filter((l) => l.incluir && l.producto_id && l.unidades > 0) ?? [];

  return (
    <Sheet abierto={abierto} titulo={vista ? 'Revisa el pedido' : 'Dictar pedido'} onCerrar={cerrar} ancho="md:max-w-2xl">
      {!vista ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Di la farmacia y luego cada producto con sus unidades. Por ejemplo: <i>“Farmacia La Paz, diez losartán cincuenta, cinco atorvastatina”</i>.
          </p>
          {voz.disponible && (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={voz.escuchando ? voz.detener : voz.iniciar}
                aria-pressed={voz.escuchando}
                aria-label={voz.escuchando ? 'Detener el dictado' : 'Empezar a dictar'}
                className={`inline-flex h-20 w-20 items-center justify-center rounded-full text-white transition-colors ${voz.escuchando ? 'animate-pulse bg-rose-700' : 'bg-marca-700 hover:bg-marca-800'}`}
              >
                {voz.escuchando ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
              </button>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{voz.escuchando ? 'Escuchando… toca para terminar' : 'Toca para hablar'}</p>
            </div>
          )}
          {voz.error && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{voz.error}</p>}
          <Campo rotulo={voz.disponible ? 'Lo que escuché (puedes corregirlo)' : 'Escribe el pedido'}>
            <textarea rows={4} value={voz.texto + (voz.parcial ? ` ${voz.parcial}` : '')} onChange={(e) => voz.setTexto(e.target.value)} className={`${estiloInput} py-2`} placeholder="Farmacia La Paz, 10 losartán 50, 5 atorvastatina" />
          </Campo>
          <div className="flex justify-end gap-2">
            <Boton onClick={cerrar}>Cancelar</Boton>
            <Boton variante="primario" icono={Wand2} disabled={!voz.texto.trim()} onClick={interpretar}>Ver pedido</Boton>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            {vista.cliente ? <Avatar nombre={vista.cliente.nombre_comercial} tamano={40} /> : null}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-500">Farmacia</p>
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{vista.cliente?.nombre_comercial ?? 'No la reconocí: elígela'}</p>
            </div>
            {vista.alternativas.length > 0 && (
              <select aria-label="Otras farmacias parecidas" value="" onChange={(e) => { const c = vista.alternativas.find((x) => x.id === e.target.value); if (c) setVista({ ...vista, cliente: c }); }} className={`${estiloInput} w-auto`}>
                <option value="">¿Era otra?</option>
                {vista.alternativas.map((c) => <option key={c.id} value={c.id}>{c.nombre_comercial}</option>)}
              </select>
            )}
            <Boton tamano="sm" onClick={() => setBuscandoCliente(true)}>Buscar</Boton>
          </div>

          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {vista.lineas.length === 0 && <li className="p-3 text-sm text-slate-500">No encontré productos en lo que dijiste. Vuelve a dictar.</li>}
            {vista.lineas.map((l, i) => (
              <li key={i} className={`flex flex-wrap items-center gap-2 px-1 py-2 ${l.incluir ? '' : 'opacity-60'}`}>
                <Casilla etiqueta={`Incluir ${l.texto}`} marcada={l.incluir} onChange={(v) => cambiarLinea(i, { incluir: v })} />
                <div className="min-w-0 flex-1">
                  <select
                    aria-label={`Producto para "${l.texto}"`}
                    value={l.producto_id}
                    onChange={(e) => cambiarLinea(i, { producto_id: e.target.value, incluir: !!e.target.value })}
                    className={`${estiloInput} min-h-9`}
                  >
                    <option value="">— Elegir producto —</option>
                    {l.opciones.map((p) => <option key={p.id} value={p.id}>{p.nombre_comercial}{p.presentacion ? ` · ${p.presentacion}` : ''}</option>)}
                  </select>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                    Escuché: “{l.texto}”
                    {l.producto_id && l.confianza < 0.8 && <Etiqueta tono="aviso">Revisar</Etiqueta>}
                    {!l.opciones.length && <Etiqueta tono="peligro">Sin coincidencias</Etiqueta>}
                  </p>
                </div>
                <PasoUnidades valor={l.unidades} onChange={(n) => cambiarLinea(i, { unidades: n })} paso={Math.max(1, porId.get(l.producto_id)?.empaque_minimo ?? 1)} min={1} compacto />
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap justify-between gap-2">
            <Boton icono={RotateCcw} onClick={() => setVista(null)}>Volver a dictar</Boton>
            <Boton
              variante="primario"
              icono={ShoppingCart}
              disabled={!vista.cliente || aAgregar.length === 0}
              onClick={() => { if (vista.cliente) { onConfirmar(vista.cliente, aAgregar.map((l) => ({ producto_id: l.producto_id, unidades: l.unidades }))); voz.setTexto(''); setVista(null); } }}
            >
              {vista.cliente ? `Agregar ${aAgregar.length} al carrito` : 'Elige la farmacia'}
            </Boton>
          </div>
        </div>
      )}
      <SelectorCliente abierto={buscandoCliente} clientes={clientes} conCarrito={conCarrito} onCerrar={() => setBuscandoCliente(false)} onElegir={(c) => { setVista((v) => (v ? { ...v, cliente: c } : v)); setBuscandoCliente(false); }} />
    </Sheet>
  );
}
