import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, History, RefreshCw } from 'lucide-react';
import { Boton, Campo, Etiqueta, Tarjeta, Vacio, estiloInput } from '../components/ui/kit';
import { getSupabaseClient } from '../services/supabaseClient';
import { aCsv, descargarTexto } from '../vistas/logica';
import { useClientes, usePedidos, useUsuariosNube } from '../vistas/useDatos';
import { useMedicos } from './datos';
import { OPERACION, describirCambio } from './Historial';
import type { Cambio } from './Historial';

export const TABLAS_AUDITADAS: Record<string, string> = {
  fact_pedidos: 'Pedidos',
  dim_clientes: 'Farmacias',
  dim_medicos: 'Médicos',
  dim_droguerias: 'Droguerías',
  config_reglas_comerciales: 'Descuentos',
  metas: 'Metas',
  dim_usuarios: 'Usuarios',
  crm_tareas: 'Tareas',
};

const dia = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Registro de cambios: quién cambió qué y cuándo (se guarda 18 meses). Solo administración y gerencia; necesita conexión. */
export function RegistroCambios() {
  const { usuarios } = useUsuariosNube();
  const clientes = useClientes();
  const medicos = useMedicos();
  const pedidos = usePedidos();
  const [desde, setDesde] = useState(dia(-7));
  const [hasta, setHasta] = useState(dia(0));
  const [usuario, setUsuario] = useState('');
  const [tabla, setTabla] = useState('');
  const [filas, setFilas] = useState<Cambio[] | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const nombreUsuario = useCallback((id: string | null) => (id ? usuarios.find((u) => u.id === id)?.nombre_completo ?? 'Usuario' : 'Sistema'), [usuarios]);
  const nombreRegistro = useMemo(() => {
    const c = new Map(clientes.map((x) => [x.id, x.nombre_comercial]));
    const m = new Map(medicos.map((x) => [x.id, x.nombre]));
    const p = new Map(pedidos.map((x) => [x.id, x.correlativo]));
    const u = new Map(usuarios.map((x) => [x.id, x.nombre_completo]));
    return (t: string, id: string | null) => (id ? (t === 'dim_clientes' ? c.get(id) : t === 'dim_medicos' ? m.get(id) : t === 'fact_pedidos' ? p.get(id) : t === 'dim_usuarios' ? u.get(id) : undefined) ?? '' : '');
  }, [clientes, medicos, pedidos, usuarios]);

  const consultar = useCallback(async () => {
    const sb = getSupabaseClient();
    if (!sb) return setError('Disponible con conexión a la nube.');
    setCargando(true);
    setError('');
    let q = sb.from('registro_cambios').select('*').gte('created_at', `${desde}T00:00:00`).lt('created_at', `${dia(0) === hasta ? dia(1) : hasta}T23:59:59.999`).order('created_at', { ascending: false }).limit(300);
    if (usuario) q = q.eq('usuario_id', usuario);
    if (tabla) q = q.eq('tabla', tabla);
    const { data, error: e } = await q;
    setCargando(false);
    if (e) return setError(navigator.onLine === false ? 'Sin conexión: el registro se consulta en la nube.' : e.message);
    setFilas((data ?? []) as Cambio[]);
  }, [desde, hasta, usuario, tabla]);
  useEffect(() => {
    void consultar();
  }, [consultar]);

  const descargar = () => {
    if (!filas) return;
    descargarTexto(`cambios_${desde}_${hasta}.csv`, aCsv(['Fecha', 'Usuario', 'Acción', 'Qué', 'Registro', 'Detalle'], filas.map((c) => [
      new Date(c.created_at).toLocaleString('es'), nombreUsuario(c.usuario_id), OPERACION[c.operacion], TABLAS_AUDITADAS[c.tabla] ?? c.tabla,
      nombreRegistro(c.tabla, c.registro_id) || c.registro_id, describirCambio(c).join(' | '),
    ])));
  };

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo rotulo="Desde"><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={estiloInput} /></Campo>
          <Campo rotulo="Hasta"><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={estiloInput} /></Campo>
          <Campo rotulo="Usuario">
            <select value={usuario} onChange={(e) => setUsuario(e.target.value)} className={estiloInput}>
              <option value="">Todos</option>
              {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre_completo}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Qué">
            <select value={tabla} onChange={(e) => setTabla(e.target.value)} className={estiloInput}>
              <option value="">Todo</option>
              {Object.entries(TABLAS_AUDITADAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Campo>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Boton icono={RefreshCw} disabled={cargando} onClick={() => void consultar()}>{cargando ? 'Buscando…' : 'Actualizar'}</Boton>
          <Boton icono={Download} disabled={!filas?.length} onClick={descargar}>Descargar</Boton>
        </div>
      </Tarjeta>

      {error ? (
        <Tarjeta><p className="text-sm text-slate-500">{error}</p></Tarjeta>
      ) : !filas ? null : filas.length === 0 ? (
        <Tarjeta><Vacio icono={History} titulo="Sin cambios en este período" /></Tarjeta>
      ) : (
        <Tarjeta className="!p-0">
          <ol className="divide-y divide-slate-100 dark:divide-slate-800">
            {filas.map((c) => (
              <li key={c.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Etiqueta tono={c.operacion === 'D' ? 'peligro' : c.operacion === 'I' ? 'exito' : 'info'} punto>{OPERACION[c.operacion]}</Etiqueta>
                  <span className="font-semibold">{TABLAS_AUDITADAS[c.tabla] ?? c.tabla}{nombreRegistro(c.tabla, c.registro_id) ? ` · ${nombreRegistro(c.tabla, c.registro_id)}` : ''}</span>
                  <span className="ml-auto text-xs text-slate-500">{new Date(c.created_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })} · {nombreUsuario(c.usuario_id)}</span>
                </div>
                {describirCambio(c).map((l) => <p key={l} className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{l}</p>)}
              </li>
            ))}
          </ol>
          {filas.length === 300 && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500 dark:border-slate-800">Se muestran los 300 más recientes: acota las fechas o los filtros.</p>}
        </Tarjeta>
      )}
    </div>
  );
}
