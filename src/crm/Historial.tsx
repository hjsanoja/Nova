import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, History, Package } from 'lucide-react';
import { Etiqueta } from '../components/ui/kit';
import type { LocalProducto, LocalVisita } from '../offline/types';
import { getSupabaseClient } from '../services/supabaseClient';
import { nombreDeProducto } from '../vistas/logica';
import { fechaCorta, textoResultado } from './datos';

/** Visitas de una farmacia o un médico: resultado, objetivo, productos, muestras y nota. */
export function ListaVisitas({ visitas, productos, nombreVendedor }: { visitas: LocalVisita[]; productos: LocalProducto[]; nombreVendedor?: (id: string) => string }) {
  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const orden = [...visitas].sort((a, b) => b.checkin_en.localeCompare(a.checkin_en)).slice(0, 20);
  if (orden.length === 0) return <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500 dark:bg-slate-800/60"><ClipboardList className="h-4 w-4" aria-hidden />Todavía no hay visitas registradas (se guardan las de los últimos 90 días).</p>;
  return (
    <ol className="flex flex-col gap-2">
      {orden.map((v) => {
        const tono = v.resultado === 'pedido_tomado' || v.resultado === 'realizada' ? 'exito' : v.resultado === 'reprogramada' ? 'aviso' : 'neutro';
        return (
          <li key={v.id} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{fechaCorta(v.checkin_en)} · {new Date(v.checkin_en).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
              <Etiqueta tono={tono} punto>{textoResultado(v.resultado)}</Etiqueta>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {[nombreVendedor?.(v.vendedor_id), v.distancia_metros != null ? (v.dentro_de_radio ? 'en el lugar' : `a ${Math.round(v.distancia_metros)} m del lugar`) : 'sin GPS', v.sync_estado !== 'sincronizado' ? 'sin enviar' : null].filter(Boolean).join(' · ')}
            </p>
            {v.objetivo && <p className="mt-1.5"><span className="text-slate-500">Objetivo: </span>{v.objetivo}</p>}
            {!!v.productos?.length && (
              <p className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                <Package className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                {v.productos.map((id) => {
                  const m = v.muestras?.find((x) => x.producto_id === id);
                  return <span key={id} className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">{nombreDeProducto(porId.get(id))}{m ? ` · ${m.cantidad} muestra${m.cantidad === 1 ? '' : 's'}` : ''}</span>;
                })}
              </p>
            )}
            {v.notas && <p className="mt-1.5 text-slate-700 dark:text-slate-200">{v.notas}</p>}
            {v.proxima_accion && <p className="mt-1 text-xs text-marca-800 dark:text-marca-300">Próxima acción: {v.proxima_accion}{v.proxima_fecha ? ` (${fechaCorta(v.proxima_fecha)})` : ''}</p>}
          </li>
        );
      })}
    </ol>
  );
}

export interface Cambio {
  id: number;
  tabla: string;
  registro_id: string | null;
  operacion: 'I' | 'U' | 'D';
  usuario_id: string | null;
  cambios: Record<string, [unknown, unknown]> | Record<string, unknown> | null;
  created_at: string;
}

/** Nombres de los campos en palabras (los que no estén aquí se muestran tal cual). */
export const CAMPOS: Record<string, string> = {
  estado: 'Estado', numero_factura: 'Factura', observaciones: 'Nota', descuento_pedido_pct: 'Descuento del pedido', deleted_at: 'Borrado',
  nombre_comercial: 'Nombre', razon_social: 'Razón social', rif: 'RIF', direccion: 'Dirección', telefono: 'Teléfono', frecuencia_dias: 'Frecuencia (días)',
  estado_validacion: 'Validación', segmento: 'Segmento', nombre: 'Nombre', especialidad: 'Especialidad', centro: 'Centro', categoria: 'Categoría',
  vendedor_id: 'Representante', objetivo: 'Objetivo', indicador: 'Indicador', periodo: 'Mes', activo: 'Activo', rol: 'Rol', correo: 'Correo',
  descuento_max_pct: 'Descuento máximo', formato_export: 'Formato de archivo', titulo: 'Título', vence_en: 'Vence', visitas_mes: 'Visitas por ciclo',
  transferencista_id: 'Transferencista', drogueria_id: 'Droguería', cliente_id: 'Farmacia', lat: 'Latitud', lon: 'Longitud', zona: 'Zona', ciudad: 'Ciudad',
};
const valorTexto = (v: unknown) => (v == null || v === '' ? '—' : typeof v === 'object' ? 'cambió' : String(v));
export const OPERACION = { I: 'Creó', U: 'Cambió', D: 'Eliminó' } as const;

/** Diferencias de un cambio en líneas legibles: "Estado: enviado → procesado_total". */
export function describirCambio(c: Pick<Cambio, 'operacion' | 'cambios'>): string[] {
  if (c.operacion !== 'U' || !c.cambios) return [];
  return Object.entries(c.cambios as Record<string, [unknown, unknown]>)
    .filter(([, par]) => Array.isArray(par))
    .map(([k, [antes, despues]]) => (k === 'deleted_at' ? (despues ? 'Lo borró' : 'Lo recuperó') : `${CAMPOS[k] ?? k}: ${valorTexto(antes)} → ${valorTexto(despues)}`));
}

/** Historial de cambios de un registro (solo administración y gerencia; necesita conexión). */
export function HistorialRegistro({ tabla, registroId, nombreUsuario }: { tabla: string; registroId: string; nombreUsuario: (id: string) => string }) {
  const [filas, setFilas] = useState<Cambio[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return setError('Disponible con conexión a la nube.');
    let vivo = true;
    void Promise.resolve(sb.from('registro_cambios').select('*').eq('tabla', tabla).eq('registro_id', registroId).order('created_at', { ascending: false }).limit(50)).then(({ data, error: e }) => {
      if (!vivo) return;
      if (e) setError(navigator.onLine === false ? 'Sin conexión: el historial se consulta en la nube.' : e.message);
      else setFilas((data ?? []) as Cambio[]);
    });
    return () => {
      vivo = false;
    };
  }, [tabla, registroId]);
  if (error) return <p className="text-sm text-slate-500">{error}</p>;
  if (!filas) return <p className="text-sm text-slate-500">Cargando…</p>;
  if (filas.length === 0) return <p className="flex items-center gap-2 text-sm text-slate-500"><History className="h-4 w-4" aria-hidden />Sin cambios registrados.</p>;
  return (
    <ol className="flex flex-col gap-2">
      {filas.map((c) => (
        <li key={c.id} className="rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
          <p className="text-xs text-slate-500">{new Date(c.created_at).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })} · {c.usuario_id ? nombreUsuario(c.usuario_id) : 'Sistema'}</p>
          <p className="font-medium">{OPERACION[c.operacion]}</p>
          {describirCambio(c).map((l) => <p key={l} className="text-xs text-slate-700 dark:text-slate-200">{l}</p>)}
        </li>
      ))}
    </ol>
  );
}
