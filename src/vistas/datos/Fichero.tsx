import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Upload, X } from 'lucide-react';
import { getSupabaseClient } from '../../services/supabaseClient';
import { Boton, Etiqueta, Tarjeta, Vacio, estiloInput, useAviso, useDebounced } from '../../components/ui/kit';
import { normalizar } from '../../offline/busqueda';
import { parsearCodigos, parsearFichero } from '../fichero';
import { useClientes, useUsuariosNube } from '../useDatos';

interface Asignada { cliente_id: string; codigo: string; nombre: string; zona: string | null }

/** Qué farmacias atiende cada vendedor. Un vendedor solo verá las de su fichero (lo garantiza la base de datos). */
export function Fichero() {
  const sb = getSupabaseClient();
  const { usuarios } = useUsuariosNube();
  const vendedores = useMemo(() => usuarios.filter((u) => u.rol === 'vendedor' && u.activo), [usuarios]);
  const clientes = useClientes();
  const [vendedorId, setVendedorId] = useState('');
  const [asignadas, setAsignadas] = useState<Asignada[]>([]);
  const [cargando, setCargando] = useState(false);
  const [texto, setTexto] = useState('');
  const q = useDebounced(texto, 150);
  const [codigos, setCodigos] = useState('');
  const [reemplazar, setReemplazar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const { mostrar, nodo } = useAviso();

  useEffect(() => {
    if (!vendedorId && vendedores[0]) setVendedorId(vendedores[0].id);
  }, [vendedores, vendedorId]);

  const cargar = useCallback(async () => {
    if (!sb || !vendedorId) return setAsignadas([]);
    setCargando(true);
    const { data, error } = await sb.from('rel_cliente_vendedor').select('cliente_id, dim_clientes(codigo_interno,nombre_comercial,brick)').eq('vendedor_id', vendedorId).eq('activo', true).is('deleted_at', null);
    setCargando(false);
    if (error) return mostrar({ tipo: 'error', texto: error.message });
    setAsignadas(
      (data ?? []).map((r) => {
        const c = (r as unknown as { dim_clientes: { codigo_interno: string | null; nombre_comercial: string; brick: string | null } | null }).dim_clientes;
        return { cliente_id: r.cliente_id as string, codigo: c?.codigo_interno ?? '', nombre: c?.nombre_comercial ?? '', zona: c?.brick ?? null };
      }).sort((a, b) => a.nombre.localeCompare(b.nombre))
    );
  }, [sb, vendedorId, mostrar]);
  useEffect(() => { void cargar(); }, [cargar]);

  const asignar = async (vendedor: string, lista: string[], modo: 'agregar' | 'quitar' | 'reemplazar') => {
    if (!sb) return null;
    const { data, error } = await sb.rpc('asignar_clientes_vendedor', { p_vendedor: vendedor, p_codigos: lista, p_modo: modo });
    if (error) throw new Error(error.message);
    return data as { asignados: number; retirados: number; no_encontrados: string[] };
  };

  const ejecutar = async (accion: () => Promise<string>) => {
    setOcupado(true);
    try {
      mostrar({ tipo: 'ok', texto: await accion() });
      await cargar();
    } catch (e) {
      mostrar({ tipo: 'error', texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setOcupado(false);
    }
  };

  const yaAsignadas = useMemo(() => new Set(asignadas.map((a) => a.cliente_id)), [asignadas]);
  const candidatas = useMemo(() => {
    const t = normalizar(q);
    if (!t) return [];
    return clientes.filter((c) => c.codigo_interno && !yaAsignadas.has(c.id) && c.busqueda.includes(t)).slice(0, 25);
  }, [clientes, q, yaAsignadas]);

  const subirCsv = async (archivo: File) => {
    const { porVendedor, errores } = parsearFichero(await archivo.text());
    if (porVendedor.size === 0) return mostrar({ tipo: 'error', texto: errores[0] ?? 'No se encontró ninguna asignación en el archivo.' });
    await ejecutar(async () => {
      let asignados = 0;
      const faltan = new Set<string>();
      const sinVendedor: string[] = [];
      for (const [correo, lista] of porVendedor) {
        const v = vendedores.find((u) => u.email.toLowerCase() === correo);
        if (!v) { sinVendedor.push(correo); continue; }
        const r = await asignar(v.id, lista, reemplazar ? 'reemplazar' : 'agregar');
        asignados += r?.asignados ?? 0;
        r?.no_encontrados.forEach((c) => faltan.add(c));
      }
      const avisos = [errores.length ? `${errores.length} fila(s) con problemas` : '', sinVendedor.length ? `sin vendedor activo: ${sinVendedor.join(', ')}` : '', faltan.size ? `farmacias que no existen: ${[...faltan].slice(0, 5).join(', ')}${faltan.size > 5 ? '…' : ''}` : ''].filter(Boolean);
      return `Fichero actualizado: ${asignados} asignación(es) nuevas.${avisos.length ? ` Revisar: ${avisos.join(' · ')}.` : ''}`;
    });
  };

  if (!sb) return <Vacio titulo="El fichero se administra en la nube" texto="Conecta Supabase para asignar farmacias a los vendedores." />;
  if (vendedores.length === 0) return <Vacio titulo="Aún no hay vendedores activos" texto="Crea sus cuentas en Configuración → Usuarios (rol Vendedor)." />;

  return (
    <div className="space-y-3">
      {nodo}
      <div className="flex flex-wrap items-center gap-2">
        <select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)} aria-label="Vendedor" className={`${estiloInput} w-auto min-w-56`}>
          {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre_completo}{v.equipo ? ` · ${v.equipo}` : ''}</option>)}
        </select>
        <Etiqueta tono="teal">{asignadas.length} farmacia{asignadas.length === 1 ? '' : 's'} en su fichero</Etiqueta>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Tarjeta className="!p-0">
          <p className="border-b border-slate-100 px-3 py-2 text-sm font-bold dark:border-slate-800">Su fichero actual</p>
          {cargando ? <Vacio titulo="Cargando…" /> : asignadas.length === 0 ? <Vacio titulo="Sin farmacias asignadas" texto="Agrégalas con el buscador, pegando códigos o cargando un CSV." /> : (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {asignadas.map((a) => (
                <li key={a.cliente_id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold">{a.nombre}</p><p className="truncate text-xs text-slate-500">{a.codigo}{a.zona ? ` · ${a.zona}` : ''}</p></div>
                  <button type="button" aria-label={`Quitar ${a.nombre}`} disabled={ocupado} onClick={() => void ejecutar(async () => { await asignar(vendedorId, [a.codigo], 'quitar'); return `${a.nombre} salió de su fichero.`; })} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"><X className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

        <div className="space-y-3">
          <Tarjeta>
            <p className="mb-2 text-sm font-bold">Agregar farmacias</p>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre, código o zona" aria-label="Buscar farmacia" className={`${estiloInput} pl-9`} />
            </div>
            {candidatas.length > 0 && (
              <ul className="mb-2 max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {candidatas.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span className="min-w-0 truncate text-sm">{c.nombre_comercial} <span className="text-xs text-slate-400">{c.codigo_interno}</span></span>
                    <Boton variante="suave" disabled={ocupado} onClick={() => void ejecutar(async () => { await asignar(vendedorId, [c.codigo_interno as string], 'agregar'); return `${c.nombre_comercial} se agregó.`; })}>Agregar</Boton>
                  </li>
                ))}
              </ul>
            )}
            <textarea value={codigos} onChange={(e) => setCodigos(e.target.value)} rows={3} placeholder="…o pega códigos (uno por línea o separados por coma)" aria-label="Códigos de farmacia" className={`${estiloInput} py-2`} />
            <Boton className="mt-2" disabled={ocupado || parsearCodigos(codigos).length === 0} onClick={() => void ejecutar(async () => {
              const r = await asignar(vendedorId, parsearCodigos(codigos), 'agregar');
              setCodigos('');
              return `${r?.asignados ?? 0} agregada(s).${r?.no_encontrados.length ? ` No existen: ${r.no_encontrados.slice(0, 6).join(', ')}.` : ''}`;
            })}>Agregar códigos</Boton>
          </Tarjeta>

          <Tarjeta>
            <p className="mb-1 text-sm font-bold">Cargar muchos a la vez (CSV)</p>
            <p className="mb-2 text-xs text-slate-500">Dos columnas: código de la farmacia y correo del vendedor. Sirve para armar los ficheros de todo el equipo de una vez.</p>
            <label className="mb-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={reemplazar} onChange={(e) => setReemplazar(e.target.checked)} className="accent-marca-600" /> Reemplazar el fichero de los vendedores que aparecen en el archivo</label>
            <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
              <Upload className="h-4 w-4" /> Elegir archivo
              <input type="file" accept=".csv,.txt,text/csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void subirCsv(f); }} />
            </label>
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
