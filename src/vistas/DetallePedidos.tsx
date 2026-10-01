import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { Sheet } from '../components/capture/Sheet';
import { Boton, Etiqueta } from '../components/ui/kit';
import type { LocalDetalle, LocalPedido } from '../offline/types';
import { aCsv, descargarTexto, ESTADOS_ETIQUETA } from './logica';

export interface SolicitudDetalle {
  titulo: string;
  /** Cómo se obtuvo la cifra, en palabras (para que cualquiera pueda comprobarla). */
  calculo: string;
  pedidos: LocalPedido[];
  /** Unidades que cuentan de cada pedido (p. ej. solo las de un producto). Por defecto, todas. */
  unidadesDe?: (p: LocalPedido) => number;
  /** Aviso adicional (p. ej. que el dispositivo solo guarda los últimos 90 días). */
  nota?: string;
}

const formato = (n: number) => n.toLocaleString('es-VE');
const PASO = 100;

/** Hoja con los pedidos que forman una cifra: totales, lista, líneas de cada pedido y descarga a CSV. */
export function DetallePedidos({ solicitud, porPedido, nombres, onCerrar }: {
  solicitud: SolicitudDetalle | null;
  porPedido: Map<string, LocalDetalle[]>;
  nombres: { cliente: (id: string) => string; vendedor: (id: string) => string; drogueria: (id: string) => string; producto: (id: string) => string };
  onCerrar: () => void;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [limite, setLimite] = useState(PASO);
  const s = solicitud;
  const filas = useMemo(() => {
    if (!s) return [];
    const u = s.unidadesDe ?? ((p: LocalPedido) => (porPedido.get(p.id) ?? []).reduce((a, d) => a + d.unidades_solicitadas, 0));
    return [...s.pedidos].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((p) => ({ p, unidades: u(p) }));
  }, [s, porPedido]);
  if (!s) return null;
  const totalUnidades = filas.reduce((a, f) => a + f.unidades, 0);
  const farmacias = new Set(filas.map((f) => f.p.cliente_id)).size;

  const descargar = () =>
    descargarTexto(
      `detalle_${s.titulo.toLowerCase().replace(/[^a-z0-9]+/gi, '_')}.csv`,
      aCsv(['Fecha', 'Pedido', 'Farmacia', 'Representante', 'Drogueria', 'Estado', 'Unidades'], filas.map(({ p, unidades }) => [
        new Date(p.created_at).toLocaleString('es'), p.correlativo, nombres.cliente(p.cliente_id), nombres.vendedor(p.vendedor_id), nombres.drogueria(p.drogueria_id), ESTADOS_ETIQUETA[p.estado].texto, unidades,
      ]))
    );

  return (
    <Sheet abierto titulo={s.titulo} onCerrar={() => { setAbierto(null); setLimite(PASO); onCerrar(); }} ancho="md:max-w-3xl">
      <div className="flex flex-col gap-3">
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-950 dark:text-slate-300"><b>Cómo se calcula:</b> {s.calculo}</p>
        {s.nota && <p className="text-xs text-slate-500">{s.nota}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            <b>{formato(filas.length)}</b> pedido{filas.length === 1 ? '' : 's'} · <b>{formato(totalUnidades)}</b> unidades · <b>{formato(farmacias)}</b> farmacia{farmacias === 1 ? '' : 's'}
          </p>
          <Boton tamano="sm" icono={Download} disabled={filas.length === 0} onClick={descargar}>Descargar CSV</Boton>
        </div>
        {filas.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No hay pedidos en este detalle.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {filas.slice(0, limite).map(({ p, unidades }) => {
              const expandido = abierto === p.id;
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => setAbierto(expandido ? null : p.id)} aria-expanded={expandido} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800">
                    {expandido ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{nombres.cliente(p.cliente_id)}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {p.correlativo} · {new Date(p.created_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })} · {nombres.vendedor(p.vendedor_id)} · {nombres.drogueria(p.drogueria_id)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{formato(unidades)}</span>
                      <Etiqueta tono={ESTADOS_ETIQUETA[p.estado].tono} punto>{ESTADOS_ETIQUETA[p.estado].texto}</Etiqueta>
                    </span>
                  </button>
                  {expandido && (
                    <table className="mb-2 ml-9 w-[calc(100%-2.75rem)] text-xs">
                      <thead className="text-left text-slate-500"><tr><th className="py-1 font-medium">Producto</th><th className="py-1 text-right font-medium">Pedidas</th><th className="py-1 text-right font-medium">Confirmadas</th><th className="py-1 text-right font-medium">Dto.</th></tr></thead>
                      <tbody className="divide-y divide-slate-100 tabular-nums dark:divide-slate-800">
                        {(porPedido.get(p.id) ?? []).map((d) => (
                          <tr key={d.id}>
                            <td className="py-1 pr-2">{nombres.producto(d.producto_id)}</td>
                            <td className="py-1 text-right">{formato(d.unidades_solicitadas)}</td>
                            <td className="py-1 text-right">{d.unidades_confirmadas == null ? '—' : formato(d.unidades_confirmadas)}</td>
                            <td className="py-1 text-right">{d.descuento_pct ? `${d.descuento_pct}%` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {filas.length > limite && <Boton variante="fantasma" onClick={() => setLimite((l) => l + PASO)}>Ver {Math.min(PASO, filas.length - limite)} más</Boton>}
      </div>
    </Sheet>
  );
}
