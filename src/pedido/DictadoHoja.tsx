import { useMemo, useRef, useState } from 'react';
import { Mic, MicOff, RotateCcw, ShoppingCart, Wand2 } from 'lucide-react';
import { Sheet } from '../components/capture/Sheet';
import { Avatar, Boton, Campo, Casilla, Etiqueta, PasoUnidades, estiloInput } from '../components/ui/kit';
import type { LocalCliente, LocalDrogueria, LocalPlantilla, LocalProducto } from '../offline/types';
import { normalizar } from '../offline/busqueda';
import { interpretarDictado } from './dictado';
import type { PedidoDictado } from './dictado';
import { useDictado } from './useDictado';
import { SelectorCliente } from './SelectorCliente';

interface LineaVista { incluir: boolean; producto_id: string; unidades: number; texto: string; opciones: LocalProducto[]; confianza: number }

export interface ExtraDictado {
  /** Droguería dicha o elegida en la vista previa (null = la habitual de la farmacia). */
  drogueria_id: string | null;
  /** Guardar lo confirmado como plantilla de la farmacia. */
  plantilla: { nombre: string } | null;
}

/** Plantilla de la farmacia que mejor coincide con el nombre dicho ("plantilla semanal"); si no se dijo nombre, la más reciente. */
function plantillaDicha(plantillas: LocalPlantilla[], nombre: string): LocalPlantilla | null {
  if (plantillas.length === 0) return null;
  const buscado = normalizar(nombre);
  const ordenadas = [...plantillas].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  if (!buscado) return ordenadas[0];
  return ordenadas.find((p) => normalizar(p.nombre) === buscado) ?? ordenadas.find((p) => normalizar(p.nombre).includes(buscado) || buscado.includes(normalizar(p.nombre))) ?? null;
}

/**
 * Pedido por voz: el vendedor dice la farmacia, los productos y las unidades; NOVA muestra una vista previa para
 * confirmar o corregir y lo agrega al carrito de esa farmacia. Si el navegador no permite dictar, se escribe la frase.
 */
export function DictadoHoja({ abierto, clientes, productos, droguerias, plantillasDe, clienteActual, conCarrito, onCerrar, onConfirmar }: {
  abierto: boolean;
  clientes: LocalCliente[];
  productos: LocalProducto[];
  droguerias: LocalDrogueria[];
  /** Plantillas guardadas de una farmacia ("Farmacia La Paz, plantilla semanal" la carga). */
  plantillasDe: (cliente_id: string) => LocalPlantilla[];
  /** Farmacia del carrito activo: se usa si el dictado no nombra ninguna. */
  clienteActual: LocalCliente | undefined;
  conCarrito: Set<string>;
  onCerrar: () => void;
  onConfirmar: (cliente: LocalCliente, lineas: { producto_id: string; unidades: number }[], extra: ExtraDictado) => void;
}) {
  // Al detectar la pausa final se pasa solo a la vista previa (no hace falta tocar "Ver pedido").
  const alTerminar = useRef<(t: string) => void>(() => undefined);
  const voz = useDictado((t) => alTerminar.current(t));
  const [vista, setVista] = useState<{
    cliente: LocalCliente | null;
    alternativas: LocalCliente[];
    lineas: LineaVista[];
    drogueria_id: string;
    guardarPlantilla: boolean;
    nombrePlantilla: string;
    /** Se cargó una plantilla existente (no se vuelve a guardar salvo que se marque). */
    desdePlantilla: string | null;
  } | null>(null);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  const interpretar = (textoDictado: string = voz.texto) => {
    if (voz.escuchando) voz.detener();
    const r: PedidoDictado<LocalCliente, LocalProducto, LocalDrogueria> = interpretarDictado(textoDictado, clientes, productos, droguerias);
    const cliente = r.cliente ?? clienteActual ?? null;
    // "Farmacia La Paz, plantilla semanal" sin productos: se carga esa plantilla guardada.
    const guardada = r.plantilla && r.lineas.length === 0 && cliente ? plantillaDicha(plantillasDe(cliente.id), r.plantilla.nombre) : null;
    const lineas: LineaVista[] = guardada
      ? guardada.lineas.flatMap((l) => {
          const p = porId.get(l.producto_id);
          return p ? [{ incluir: true, producto_id: p.id, unidades: l.unidades, texto: p.nombre_comercial, opciones: [p], confianza: 1 }] : [];
        })
      : r.lineas.map((l) => ({
          incluir: !!l.producto,
          producto_id: l.producto?.id ?? '',
          unidades: l.unidades,
          texto: l.texto,
          opciones: [...(l.producto ? [l.producto] : []), ...l.alternativas],
          confianza: l.confianza,
        }));
    setVista({
      cliente,
      alternativas: r.alternativasCliente,
      lineas,
      drogueria_id: r.drogueria?.id ?? guardada?.drogueria_id ?? '',
      guardarPlantilla: !!r.plantilla && !guardada,
      nombrePlantilla: r.plantilla?.nombre || 'Pedido habitual',
      desdePlantilla: guardada?.nombre ?? null,
    });
  };

  alTerminar.current = (t) => interpretar(t);

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
            Di la farmacia, la droguería y cada producto con sus unidades. Al hacer una pausa, verás el pedido para confirmarlo.
          </p>
          <details className="-mt-2 text-sm text-slate-600 dark:text-slate-300">
            <summary className="cursor-pointer font-medium text-marca-700 dark:text-marca-300">Ver ejemplos</summary>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li><i>“Farmacia La Paz por Cobeca, diez losartán cincuenta y cinco atorvastatina”</i></li>
              <li>Para guardarlo: termina con <i>“guárdalo como plantilla semanal”</i>.</li>
              <li>Para repetirlo: <i>“Farmacia La Paz, plantilla semanal”</i>.</li>
            </ul>
          </details>
          {voz.disponible && (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={voz.escuchando ? voz.detener : voz.iniciar}
                aria-pressed={voz.escuchando}
                aria-label={voz.escuchando ? 'Detener el dictado' : 'Empezar a dictar'}
                className={`inline-flex h-16 w-16 items-center justify-center rounded-full text-white transition-colors sm:h-20 sm:w-20 ${voz.escuchando ? 'animate-pulse bg-rose-700' : 'bg-marca-700 hover:bg-marca-800'}`}
              >
                {voz.escuchando ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
              </button>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{voz.escuchando ? 'Escuchando… haz una pausa al terminar' : 'Toca para hablar'}</p>
            </div>
          )}
          {voz.error && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{voz.error}</p>}
          <Campo rotulo={voz.disponible ? 'Lo que escuché (puedes corregirlo)' : 'Escribe el pedido'}>
            <textarea rows={3} value={voz.texto + (voz.parcial ? ` ${voz.parcial}` : '')} onChange={(e) => voz.setTexto(e.target.value)} className={`${estiloInput} py-2`} placeholder="Farmacia La Paz, 10 losartán 50, 5 atorvastatina" />
          </Campo>
          <div className="flex justify-end gap-2">
            <Boton onClick={cerrar}>Cancelar</Boton>
            <Boton variante="primario" icono={Wand2} disabled={!voz.texto.trim()} onClick={() => interpretar()}>Ver pedido</Boton>
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
              <select aria-label="Otras farmacias parecidas" value="" onChange={(e) => { const c = vista.alternativas.find((x) => x.id === e.target.value); if (c) setVista({ ...vista, cliente: c }); }} className={`${estiloInput} w-full sm:w-auto`}>
                <option value="">¿Era otra?</option>
                {vista.alternativas.map((c) => <option key={c.id} value={c.id}>{c.nombre_comercial}</option>)}
              </select>
            )}
            <Boton tamano="sm" onClick={() => setBuscandoCliente(true)}>Buscar</Boton>
          </div>

          {vista.desdePlantilla && <p className="text-sm text-slate-600 dark:text-slate-300">Cargué la plantilla <b>{vista.desdePlantilla}</b>. Ajusta lo que haga falta.</p>}

          <Campo rotulo="Droguería">
            <select value={vista.drogueria_id} onChange={(e) => setVista({ ...vista, drogueria_id: e.target.value })} className={estiloInput}>
              <option value="">La habitual de la farmacia</option>
              {droguerias.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </Campo>

          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {vista.lineas.length === 0 && <li className="p-3 text-sm text-slate-500">No encontré productos en lo que dijiste. Vuelve a dictar.</li>}
            {vista.lineas.map((l, i) => (
              <li key={i} className={`grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-1 gap-y-1 py-2 pr-2 ${l.incluir ? '' : 'opacity-60'}`}>
                <Casilla etiqueta={`Incluir ${l.texto}`} marcada={l.incluir} onChange={(v) => cambiarLinea(i, { incluir: v })} />
                <select
                  aria-label={`Producto para "${l.texto}"`}
                  value={l.producto_id}
                  onChange={(e) => cambiarLinea(i, { producto_id: e.target.value, incluir: !!e.target.value })}
                  className={`${estiloInput} min-h-9 min-w-0`}
                >
                  <option value="">— Elegir producto —</option>
                  {l.opciones.map((p) => <option key={p.id} value={p.id}>{p.nombre_comercial}{p.presentacion ? ` · ${p.presentacion}` : ''}</option>)}
                </select>
                <div className="col-start-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-slate-500">
                    <span className="truncate">Escuché: “{l.texto}”</span>
                    {l.producto_id && l.confianza < 0.8 && <Etiqueta tono="aviso">Revisar</Etiqueta>}
                    {!l.opciones.length && <Etiqueta tono="peligro">Sin coincidencias</Etiqueta>}
                  </p>
                  <PasoUnidades valor={l.unidades} onChange={(n) => cambiarLinea(i, { unidades: n })} paso={1} min={1} compacto />
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div className="-my-1 -ml-2 flex items-center">
              <Casilla etiqueta="Guardar también como plantilla de esta farmacia" marcada={vista.guardarPlantilla} onChange={(v) => setVista({ ...vista, guardarPlantilla: v })} />
              <span className="text-sm text-slate-800 dark:text-slate-200" aria-hidden>Guardar también como plantilla de esta farmacia</span>
            </div>
            {vista.guardarPlantilla && (
              <input value={vista.nombrePlantilla} onChange={(e) => setVista({ ...vista, nombrePlantilla: e.target.value })} aria-label="Nombre de la plantilla" placeholder="Nombre de la plantilla" className={estiloInput} />
            )}
          </div>

          <div className="flex flex-wrap justify-between gap-2">
            <Boton icono={RotateCcw} onClick={() => setVista(null)}>Volver a dictar</Boton>
            <Boton
              variante="primario"
              icono={ShoppingCart}
              disabled={!vista.cliente || aAgregar.length === 0}
              onClick={() => {
                if (!vista.cliente) return;
                onConfirmar(vista.cliente, aAgregar.map((l) => ({ producto_id: l.producto_id, unidades: l.unidades })), {
                  drogueria_id: vista.drogueria_id || null,
                  plantilla: vista.guardarPlantilla ? { nombre: vista.nombrePlantilla.trim() || 'Pedido habitual' } : null,
                });
                voz.setTexto('');
                setVista(null);
              }}
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
