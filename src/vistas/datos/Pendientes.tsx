import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { getSupabaseClient } from '../../services/supabaseClient';
import { Boton, Etiqueta, Tarjeta, Vacio, useAviso } from '../../components/ui/kit';

interface PendCliente { drogueria_id: string; drogueria: string; cod_cliente_drogueria: string | null; nombre_cliente_drogueria: string; filas: number; unidades: number }
interface PendProducto { drogueria_id: string; drogueria: string; cod_producto_drogueria: string; nombre_producto_drogueria: string | null; cod_sap_reportado: string | null; filas: number; unidades: number }
interface Estado { drogueria: string; filas: number; pct_homologado: number | null }
interface Candidato { id: string; nombre: string; detalle: string; score: number }

/**
 * Lo que las droguerías reportan y todavía no se relaciona con una farmacia o producto de NOVA. Se ordena por volumen:
 * resolver lo de arriba enlaza la mayor parte del historial. Al asignar, todo lo ya cargado de ese código se enlaza solo.
 */
export function Pendientes() {
  const sb = getSupabaseClient();
  const [clientes, setClientes] = useState<PendCliente[] | null>(null);
  const [productos, setProductos] = useState<PendProducto[] | null>(null);
  const [estados, setEstados] = useState<Estado[]>([]);
  const [error, setError] = useState('');
  const { mostrar, nodo } = useAviso();

  const cargar = useCallback(async () => {
    if (!sb) return;
    const [c, p, e] = await Promise.all([
      sb.from('vw_pendientes_clientes').select('*').order('unidades', { ascending: false }).limit(50),
      sb.from('vw_pendientes_productos').select('*').order('unidades', { ascending: false }).limit(50),
      sb.from('vw_estado_homologacion').select('drogueria,filas,pct_homologado').gt('filas', 0).order('pct_homologado', { ascending: true }),
    ]);
    const fallo = c.error ?? p.error ?? e.error;
    if (fallo) return setError(fallo.message);
    setClientes((c.data ?? []) as PendCliente[]);
    setProductos((p.data ?? []) as PendProducto[]);
    setEstados((e.data ?? []) as Estado[]);
  }, [sb]);
  useEffect(() => { void cargar(); }, [cargar]);

  if (!sb) return <Vacio titulo="La homologación se hace en la nube" texto="Conecta Supabase para relacionar los reportes de las droguerías con tus farmacias y productos." />;
  if (error) return <Vacio titulo="No se pudo cargar" texto={error} />;
  if (!clientes || !productos) return <Vacio titulo="Cargando…" />;

  return (
    <div className="space-y-3">
      {nodo}
      {estados.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {estados.map((e) => <Etiqueta key={e.drogueria} tono={(e.pct_homologado ?? 0) >= 95 ? 'verde' : (e.pct_homologado ?? 0) >= 70 ? 'ambar' : 'rojo'}>{e.drogueria}: {e.pct_homologado ?? 0}% enlazado</Etiqueta>)}
        </div>
      )}
      {clientes.length === 0 && productos.length === 0 ? (
        <Tarjeta><Vacio icono={CheckCircle2} titulo="Todo está homologado" texto="Cuando cargues un reporte con farmacias o productos nuevos, aparecerán aquí." /></Tarjeta>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          <Bloque titulo="Farmacias sin relacionar" vacio={clientes.length === 0}>
            {clientes.map((f) => (
              <Fila key={`${f.drogueria_id}|${f.cod_cliente_drogueria}|${f.nombre_cliente_drogueria}`}
                titulo={f.nombre_cliente_drogueria} sub={`${f.drogueria}${f.cod_cliente_drogueria ? ` · cuenta ${f.cod_cliente_drogueria}` : ''} · ${f.unidades} uds`}
                buscar={async () => {
                  const { data, error: e } = await sb.rpc('sugerir_farmacias', { p_nombre: f.nombre_cliente_drogueria, p_limite: 5 });
                  if (e) throw new Error(e.message);
                  return ((data ?? []) as { cliente_id: string; nombre_comercial: string; codigo_interno: string | null; brick: string | null; score: number }[]).map((x) => ({ id: x.cliente_id, nombre: x.nombre_comercial, detalle: [x.codigo_interno, x.brick].filter(Boolean).join(' · '), score: x.score }));
                }}
                asignar={async (id) => {
                  const { error: e } = await sb.rpc('homologar_cliente', { p_drogueria: f.drogueria_id, p_cliente: id, p_codigo: f.cod_cliente_drogueria, p_nombre: f.nombre_cliente_drogueria });
                  if (e) throw new Error(e.message);
                  mostrar({ tipo: 'ok', texto: `"${f.nombre_cliente_drogueria}" quedó relacionada; su historial se enlazó.` });
                  await cargar();
                }}
                alError={(t) => mostrar({ tipo: 'error', texto: t })}
              />
            ))}
          </Bloque>
          <Bloque titulo="Productos sin relacionar" vacio={productos.length === 0}>
            {productos.map((p) => (
              <Fila key={`${p.drogueria_id}|${p.cod_producto_drogueria}`}
                titulo={p.nombre_producto_drogueria ?? p.cod_producto_drogueria} sub={`${p.drogueria} · código ${p.cod_producto_drogueria} · ${p.unidades} uds`}
                buscar={async () => {
                  const { data, error: e } = await sb.rpc('sugerir_productos', { p_nombre: p.nombre_producto_drogueria ?? p.cod_producto_drogueria, p_limite: 5 });
                  if (e) throw new Error(e.message);
                  return ((data ?? []) as { producto_id: string; nombre_comercial: string; sku: string; presentacion: string | null; score: number }[]).map((x) => ({ id: x.producto_id, nombre: x.nombre_comercial, detalle: [x.sku, x.presentacion].filter(Boolean).join(' · '), score: x.score }));
                }}
                asignar={async (id) => {
                  const { error: e } = await sb.rpc('homologar_producto', { p_drogueria: p.drogueria_id, p_producto: id, p_codigo: p.cod_producto_drogueria, p_descripcion: p.nombre_producto_drogueria });
                  if (e) throw new Error(e.message);
                  mostrar({ tipo: 'ok', texto: `Código ${p.cod_producto_drogueria} relacionado; su historial se enlazó.` });
                  await cargar();
                }}
                alError={(t) => mostrar({ tipo: 'error', texto: t })}
              />
            ))}
          </Bloque>
        </div>
      )}
    </div>
  );
}

function Bloque({ titulo, vacio, children }: { titulo: string; vacio: boolean; children: React.ReactNode }) {
  return (
    <Tarjeta className="!p-0">
      <p className="border-b border-slate-100 px-3 py-2 text-sm font-bold dark:border-slate-800">{titulo}</p>
      {vacio ? <Vacio titulo="Nada pendiente aquí" /> : <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">{children}</ul>}
    </Tarjeta>
  );
}

function Fila({ titulo, sub, buscar, asignar, alError }: { titulo: string; sub: string; buscar: () => Promise<Candidato[]>; asignar: (id: string) => Promise<void>; alError: (t: string) => void }) {
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const proteger = async (fn: () => Promise<void>) => {
    setOcupado(true);
    try { await fn(); } catch (e) { alError(e instanceof Error ? e.message : String(e)); } finally { setOcupado(false); }
  };
  return (
    <li className="px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0"><p className="truncate text-sm font-semibold">{titulo}</p><p className="truncate text-xs text-slate-500">{sub}</p></div>
        <Boton variante="suave" disabled={ocupado} onClick={() => candidatos ? setCandidatos(null) : void proteger(async () => setCandidatos(await buscar()))}>{candidatos ? 'Cerrar' : 'Relacionar'}</Boton>
      </div>
      {candidatos && (
        <ul className="mt-2 space-y-1">
          {candidatos.length === 0 && <li className="text-xs text-slate-500">Sin candidatos parecidos: cárgalo primero en Cargar y editar datos.</li>}
          {candidatos.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/60">
              <span className="min-w-0 truncate text-xs"><b>{c.nombre}</b> <span className="text-slate-500">{c.detalle}</span> <Etiqueta tono={c.score >= 0.6 ? 'verde' : 'gris'}>{Math.round(c.score * 100)}%</Etiqueta></span>
              <Boton variante="primario" disabled={ocupado} onClick={() => void proteger(() => asignar(c.id))}>Es esta</Boton>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
