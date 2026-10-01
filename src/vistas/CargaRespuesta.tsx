import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileUp, XCircle } from 'lucide-react';
import { Sheet } from '../components/capture/Sheet';
import { Boton, BotonArchivo, Campo, Casilla, Etiqueta, estiloInput } from '../components/ui/kit';
import { obtenerDb } from '../offline/db';
import type { LocalCliente, LocalDetalle, LocalDrogueria, LocalMapCliente, LocalMapProducto, LocalPedido, LocalProducto } from '../offline/types';
import { ErrorArchivo, leerArchivoTabla } from '../services/leerHoja';
import type { Tabla } from '../services/leerHoja';
import { cruzarRespuesta, leerRespuesta } from '../services/respuestaDrogueria';
import type { PedidoCruzado } from '../services/respuestaDrogueria';
import { getSupabaseClient } from '../services/supabaseClient';
import { ESTADOS_ETIQUETA, nombreDeProducto } from './logica';
import { aplicarConfirmacionLocal } from './mesa';

export const ABIERTOS = ['enviado_teletransferencia', 'en_revision', 'en_proceso'];
const ACEPTA = '.xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface Resultado { correlativo: string; ok: boolean; texto: string }
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Carga el archivo con el que la droguería responde (lo despachado) y lo cruza con los pedidos abiertos.
 *  - Desde la lista "Por procesar": muestra cómo quedaría cada pedido y los confirma todos de una vez.
 *  - Desde un pedido abierto (`pedidoFijo`): llena las "Confirmadas" de ese pedido para revisarlas antes de confirmar.
 */
export function CargaRespuesta({
  onCerrar, droguerias, pedidos, porPedido, clientes, productos, mapProductos, mapClientes, pedidoFijo, onUsar, onTerminado, esAdmin, irAFormato,
}: {
  onCerrar: () => void;
  droguerias: LocalDrogueria[];
  pedidos: LocalPedido[];
  porPedido: Map<string, LocalDetalle[]>;
  clientes: LocalCliente[];
  productos: LocalProducto[];
  mapProductos: LocalMapProducto[];
  mapClientes: LocalMapCliente[];
  pedidoFijo?: LocalPedido;
  onUsar?: (r: PedidoCruzado) => void;
  onTerminado?: (resumen: string) => void;
  esAdmin: boolean;
  irAFormato?: () => void;
}) {
  const abiertos = useMemo(() => pedidos.filter((p) => ABIERTOS.includes(p.estado)), [pedidos]);
  // Por defecto, la droguería del pedido o la que más pedidos abiertos tiene.
  const [drogueriaId, setDrogueriaId] = useState(() => {
    if (pedidoFijo) return pedidoFijo.drogueria_id;
    const cuenta = new Map<string, number>();
    for (const p of abiertos) cuenta.set(p.drogueria_id, (cuenta.get(p.drogueria_id) ?? 0) + 1);
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? droguerias[0]?.id ?? '';
  });
  const [archivo, setArchivo] = useState<{ nombre: string; tabla: Tabla } | null>(null);
  const [error, setError] = useState('');
  const [quitados, setQuitados] = useState<Set<string>>(new Set());
  const [aplicando, setAplicando] = useState<{ hechos: number; total: number } | null>(null);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);

  const drogueria = droguerias.find((d) => d.id === drogueriaId);
  const formato = drogueria?.formato_export?.respuesta;
  const nombreCliente = useMemo(() => new Map(clientes.map((c) => [c.id, c.nombre_comercial])), [clientes]);
  const producto = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  const leida = useMemo(() => (archivo ? leerRespuesta(archivo.tabla, formato) : null), [archivo, formato]);
  const cruce = useMemo(() => {
    if (!leida || leida.filas.length === 0 || !drogueria) return null;
    return cruzarRespuesta({
      filas: leida.filas, drogueriaId: drogueria.id, abiertos, todos: pedidos, detallesPorPedido: porPedido, productos, mapProductos, mapClientes,
      pedidoFijo, codigoProducto: formato?.codigo_producto, ausentes: formato?.ausentes,
    });
  }, [leida, drogueria, abiertos, pedidos, porPedido, productos, mapProductos, mapClientes, pedidoFijo, formato]);
  const elegidos = cruce?.pedidos.filter((p) => !quitados.has(p.pedido.id)) ?? [];

  const abrirArchivo = async (f: File) => {
    setError('');
    setResultados(null);
    setQuitados(new Set());
    try {
      setArchivo({ nombre: f.name, tabla: await leerArchivoTabla(f, formato?.hoja) });
    } catch (e) {
      setArchivo(null);
      setError(e instanceof ErrorArchivo ? e.message : `No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const confirmarTodos = async () => {
    const sb = getSupabaseClient();
    const salida: Resultado[] = [];
    setAplicando({ hechos: 0, total: elegidos.length });
    for (const [i, pc] of elegidos.entries()) {
      const { pedido: p } = pc;
      try {
        if (sb) {
          const { data: toma, error: e1 } = await sb.rpc('tomar_pedido', { p_pedido: p.id });
          if (e1) throw new Error(e1.message);
          if (!toma?.ok) {
            salida.push({ correlativo: p.correlativo, ok: false, texto: `${toma?.nombre ?? 'Otra persona'} lo está procesando.` });
            continue;
          }
          try {
            const { data, error: e2 } = await sb.rpc('confirmar_pedido', { p_pedido: p.id, p_confirmaciones: pc.confirmaciones, p_numero_factura: pc.factura || null });
            if (e2) throw new Error(e2.message);
            salida.push({ correlativo: p.correlativo, ok: true, texto: ESTADOS_ETIQUETA[(data as { estado: LocalPedido['estado'] }).estado].texto });
          } finally {
            await sb.rpc('liberar_pedido', { p_pedido: p.id });
          }
        } else {
          const db = obtenerDb();
          const lineas = porPedido.get(p.id) ?? [];
          await db.transaction('rw', db.detalles, db.pedidos, async () => {
            await db.detalles.bulkPut(aplicarConfirmacionLocal(lineas, pc.confirmaciones));
            await db.pedidos.update(p.id, { estado: pc.estado, numero_factura: pc.factura || p.numero_factura || null, updated_at: new Date().toISOString() });
          });
          salida.push({ correlativo: p.correlativo, ok: true, texto: `${ESTADOS_ETIQUETA[pc.estado].texto} (demostración)` });
        }
      } catch (e) {
        salida.push({ correlativo: p.correlativo, ok: false, texto: e instanceof Error ? e.message : String(e) });
      } finally {
        setAplicando({ hechos: i + 1, total: elegidos.length });
      }
    }
    setAplicando(null);
    setResultados(salida);
    const bien = salida.filter((r) => r.ok).length;
    onTerminado?.(`${bien} de ${salida.length} pedido${salida.length === 1 ? '' : 's'} confirmado${salida.length === 1 ? '' : 's'} con el archivo de ${drogueria?.nombre ?? 'la droguería'}.`);
  };

  const conteo = (estado: string) => elegidos.filter((p) => p.estado === estado).length;
  const titulo = pedidoFijo ? `Respuesta de la droguería · ${pedidoFijo.correlativo}` : 'Cargar respuesta de la droguería';

  return (
    <Sheet abierto titulo={titulo} onCerrar={aplicando ? () => undefined : onCerrar} ancho="md:max-w-3xl">
      <div className="flex flex-col gap-4 text-sm">
        {resultados ? (
          <>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {resultados.map((r) => (
                <li key={r.correlativo} className="flex items-center gap-2 px-3 py-2">
                  {r.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> : <XCircle className="h-4 w-4 shrink-0 text-rose-600" aria-hidden />}
                  <span className="font-semibold">{r.correlativo}</span>
                  <span className="text-slate-600 dark:text-slate-300">{r.ok ? `Quedó ${r.texto.toLowerCase()}.` : r.texto}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end"><Boton variante="primario" onClick={onCerrar}>Listo</Boton></div>
          </>
        ) : (
          <>
            <p className="text-slate-600 dark:text-slate-300">
              {pedidoFijo
                ? 'Sube el archivo que devolvió la droguería: NOVA llena las unidades confirmadas de este pedido y tú revisas antes de confirmar.'
                : 'Sube el archivo que devolvió la droguería (Excel o CSV). NOVA ubica cada pedido, te muestra cómo quedaría y los confirmas todos de una vez.'}
            </p>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <Campo rotulo="Droguería">
                <select value={drogueriaId} disabled={!!pedidoFijo} onChange={(e) => setDrogueriaId(e.target.value)} className={estiloInput}>
                  {droguerias.map((d) => <option key={d.id} value={d.id}>{d.nombre} · {abiertos.filter((p) => p.drogueria_id === d.id).length} abiertos</option>)}
                </select>
              </Campo>
              <BotonArchivo icono={FileUp} variante="primario" accept={ACEPTA} onArchivo={(f) => void abrirArchivo(f)}>{archivo ? 'Cambiar archivo' : 'Elegir archivo'}</BotonArchivo>
            </div>
            <p className="-mt-2 text-xs text-slate-500">
              {formato ? 'Se usa el formato de respuesta guardado para esta droguería.' : 'Esta droguería aún no tiene formato de respuesta: NOVA adivina las columnas por sus títulos.'}
              {esAdmin && irAFormato && <> <button type="button" onClick={irAFormato} className="font-semibold text-marca-700 hover:underline dark:text-marca-300">Configurar formato</button></>}
            </p>

            {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>}

            {archivo && leida && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <FileSpreadsheet className="h-4 w-4" aria-hidden />
                <span className="truncate">{archivo.nombre} · títulos en la fila {leida.filaEncabezado} · {leida.filas.length} fila{leida.filas.length === 1 ? '' : 's'} con productos</span>
              </div>
            )}
            {leida && leida.problemas.length > 0 && (
              <div role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                {leida.problemas.map((p) => <p key={p}>{p}</p>)}
                {leida.encabezados.length > 0 && <p className="mt-1 text-xs">Títulos que encontré: {leida.encabezados.filter(Boolean).join(' · ')}</p>}
              </div>
            )}

            {cruce && (
              <>
                {!pedidoFijo && cruce.pedidos.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <Etiqueta tono="exito" punto>{plural(conteo('procesado_total'), 'completo', 'completos')}</Etiqueta>
                    <Etiqueta tono="aviso" punto>{plural(conteo('procesado_parcial'), 'parcial', 'parciales')}</Etiqueta>
                    <Etiqueta tono="peligro" punto>{conteo('rechazado')} sin despacho</Etiqueta>
                    {cruce.sinUbicar.length > 0 && <Etiqueta tono="neutro" punto>{plural(cruce.sinUbicar.length, 'fila sin ubicar', 'filas sin ubicar')}</Etiqueta>}
                  </div>
                )}
                {cruce.yaProcesados.length > 0 && (
                  <p className="text-xs text-slate-500">Ya estaban procesados (no se tocan): {cruce.yaProcesados.join(', ')}.</p>
                )}
                {cruce.pedidos.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 px-3 py-2 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">Ninguna fila del archivo corresponde a {pedidoFijo ? 'este pedido' : `un pedido abierto de ${drogueria?.nombre ?? 'esta droguería'}`}.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {cruce.pedidos.map((pc) => (
                      <li key={pc.pedido.id} className="rounded-xl border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-2 px-3 py-2">
                          {!pedidoFijo && (
                            <Casilla
                              etiqueta={`Incluir ${pc.pedido.correlativo}`}
                              marcada={!quitados.has(pc.pedido.id)}
                              onChange={(v) => setQuitados((s) => { const n = new Set(s); if (v) n.delete(pc.pedido.id); else n.add(pc.pedido.id); return n; })}
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold">{pc.pedido.correlativo} · {nombreCliente.get(pc.pedido.cliente_id) ?? 'Farmacia'}</p>
                            <p className="text-xs text-slate-500">{pc.filas} fila{pc.filas === 1 ? '' : 's'} del archivo{pc.factura ? ` · factura ${pc.factura}` : ''}</p>
                          </div>
                          <Etiqueta tono={ESTADOS_ETIQUETA[pc.estado].tono} punto>{ESTADOS_ETIQUETA[pc.estado].texto}</Etiqueta>
                        </div>
                        {pc.avisos.map((a) => <p key={a} className="flex items-start gap-1.5 px-3 pb-1 text-xs text-amber-800 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{a}</p>)}
                        <details className="border-t border-slate-100 dark:border-slate-800" open={!!pedidoFijo}>
                          <summary className="cursor-pointer px-3 py-1.5 text-xs font-semibold text-marca-700 dark:text-marca-300">Ver productos</summary>
                          <table className="w-full text-xs">
                            <thead className="text-left text-slate-500"><tr><th className="px-3 py-1">Producto</th><th className="px-2 text-right">Pedidas</th><th className="px-3 text-right">Despachadas</th></tr></thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {pc.lineas.map((l) => (
                                <tr key={l.detalle.id}>
                                  <td className="px-3 py-1">{nombreDeProducto(producto.get(l.detalle.producto_id))}{!l.enArchivo && <span className="ml-1 text-slate-400">(no viene)</span>}{l.motivoTexto && <span className="block text-slate-400">{l.motivoTexto}</span>}</td>
                                  <td className="px-2 text-right">{l.detalle.unidades_solicitadas}</td>
                                  <td className={`px-3 text-right font-semibold ${l.confirmadas < l.detalle.unidades_solicitadas ? 'text-amber-700 dark:text-amber-300' : ''}`}>{l.confirmadas}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </details>
                      </li>
                    ))}
                  </ul>
                )}
                {cruce.sinUbicar.length > 0 && (
                  <details className="rounded-xl border border-slate-200 dark:border-slate-800">
                    <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">{cruce.sinUbicar.length} fila{cruce.sinUbicar.length === 1 ? '' : 's'} sin ubicar (revísalas a mano)</summary>
                    <ul className="max-h-48 overflow-y-auto px-3 pb-2 text-xs text-slate-600 dark:text-slate-300">
                      {cruce.sinUbicar.map((s) => <li key={`${s.linea}-${s.texto}`}>Fila {s.linea} · {s.texto}: {s.motivo}</li>)}
                    </ul>
                  </details>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                  <Boton onClick={onCerrar} disabled={!!aplicando}>Cancelar</Boton>
                  {pedidoFijo ? (
                    <Boton variante="primario" disabled={cruce.pedidos.length === 0} onClick={() => cruce.pedidos[0] && onUsar?.(cruce.pedidos[0])}>Usar estas cantidades</Boton>
                  ) : (
                    <Boton variante="primario" disabled={elegidos.length === 0 || !!aplicando} onClick={() => void confirmarTodos()}>
                      {aplicando ? `Confirmando ${aplicando.hechos} de ${aplicando.total}…` : `Confirmar ${elegidos.length} pedido${elegidos.length === 1 ? '' : 's'}`}
                    </Boton>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
