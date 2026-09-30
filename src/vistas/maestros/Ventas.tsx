import { useCallback, useEffect, useState } from 'react';
import { Download, FileSpreadsheet, RefreshCw, Upload } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TablaMaestro } from '../../components/maestros/TablaMaestro';
import type { Columna } from '../../components/maestros/TablaMaestro';
import { descargarCsv, elegirArchivo, useCargaArchivo } from '../../components/import/useCargaArchivo';
import { Boton, Dato, useAviso, useConfirmar } from '../../components/ui/kit';
import { getSupabaseClient } from '../../services/supabaseClient';
import { importarVentas, resumenVentasNube } from '../../services/nubeV3';
import type { ResumenVentasNube } from '../../services/nubeV3';
import { listarDroguerias, normalizarBusqueda } from '../../services/maestros';
import { leerCsv, prepararVentas } from '../../services/cargaArchivos';
import { detectarMesDeNombreArchivo } from '../../services/importUtils';
import { useListaNube } from './comun';

interface Lote { id: string; archivo: string; filas: number; periodo_desde: string | null; periodo_hasta: string | null; created_at: string }

const PLANTILLA = 'Fecha;Cod Cliente;Nombre_cliente;Drogueria;Codigo Producto;Nombre Producto;Unidades;Cod Sap\r\n' +
  '15/02/2026;C-1001;FARMACIA EJEMPLO;COBECA;P-501;LOSARTAN 50MG X 30;12;SKU-LOS-50';

const listarLotes = async (sb: SupabaseClient): Promise<Lote[]> => {
  const { data, error } = await sb.from('import_lotes').select('id,archivo,filas,periodo_desde,periodo_hasta,created_at').order('created_at', { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as Lote[];
};

const fecha = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const COLUMNAS: Columna<Lote>[] = [
  { titulo: 'Archivo', celda: (l) => <span className="font-medium text-slate-900 dark:text-white">{l.archivo}</span> },
  { titulo: 'Filas', celda: (l) => l.filas.toLocaleString(), alinear: 'derecha' },
  { titulo: 'Período', celda: (l) => `${fecha(l.periodo_desde)} – ${fecha(l.periodo_hasta)}`, secundaria: true },
  { titulo: 'Cargado', celda: (l) => new Date(l.created_at).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }), secundaria: true },
];

/** Ventas reportadas por las droguerías: cargar reportes, ver cuánto hay en la nube y borrar archivos cargados. */
export function Ventas() {
  const cargar = useCallback(listarLotes, []);
  const { filas, cargando, error, recargar } = useListaNube(cargar);
  const [resumen, setResumen] = useState<ResumenVentasNube | null>(null);
  const { mostrar, nodo } = useAviso();
  const { confirmar, nodo: nodoConfirmar } = useConfirmar();
  const carga = useCargaArchivo();

  const verificar = useCallback(async () => {
    const sb = getSupabaseClient();
    if (!sb) return;
    try {
      setResumen(await resumenVentasNube(sb));
    } catch (e: unknown) {
      mostrar({ tipo: 'error', texto: `No se pudo consultar Supabase: ${e instanceof Error ? e.message : String(e)}` });
    }
  }, [mostrar]);
  useEffect(() => { void verificar(); }, [verificar]);

  const cargarArchivo = async () => {
    const sb = getSupabaseClient();
    const archivo = await elegirArchivo();
    if (!sb || !archivo) return;
    const leido = leerCsv(archivo.texto);
    const prep = prepararVentas(leido, { archivo: archivo.nombre, mesDelArchivo: detectarMesDeNombreArchivo(archivo.nombre)?.periodo });
    // Aviso previo: droguerías del archivo que no existen en la nube (sus filas serían rechazadas).
    const conocidas = new Set((await listarDroguerias(sb)).flatMap((d) => [normalizarBusqueda(d.codigo), normalizarBusqueda(d.nombre)]));
    const faltan = [...new Set(prep.registros.map((r) => r.nombre_drogueria ?? ''))].filter((d) => d && !conocidas.has(normalizarBusqueda(d)));
    carga.pedir(
      {
        titulo: 'Cargar ventas de droguerías', archivo: archivo.nombre, unidad: 'filas', leidas: leido.filas.length, prep,
        avisos: faltan.length ? [`Estas droguerías no existen en Datos maestros: ${faltan.join(', ')}. Sus filas serán rechazadas: créalas primero.`] : undefined,
      },
      async (avance) => {
        const r = await importarVentas(sb, prep.registros, avance);
        const lineas = [
          `Filas guardadas: ${r.insertadas.toLocaleString()}.`,
          ...(r.recibidas > r.insertadas ? [`Ya estaban cargadas (no se duplican): ${(r.recibidas - r.insertadas).toLocaleString()}.`] : []),
          `Pendientes de homologar: ${r.sin_farmacia.toLocaleString()} filas sin farmacia y ${r.sin_producto.toLocaleString()} sin producto.`,
          ...(prep.descartes.length ? [`Descartadas por datos incompletos: ${prep.descartes.length.toLocaleString()}.`] : []),
          ...(r.droguerias_desconocidas.length ? [`Rechazadas: las filas de ${r.droguerias_desconocidas.join(', ')} (droguería inexistente).`] : []),
        ];
        return { ok: r.droguerias_desconocidas.length === 0, lineas };
      },
      () => { void recargar(); void verificar(); }
    );
  };

  const borrarLotes = async (ids: string[]) => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const ok = await confirmar(`Borrar ${ids.length} archivo${ids.length === 1 ? '' : 's'} de ventas`, 'Se borran sus filas y se recalcula el consolidado mensual. Luego puedes volver a cargarlos.', { accion: 'Borrar', peligro: true });
    if (!ok) return;
    let filasBorradas = 0;
    try {
      for (const id of ids) {
        const { data, error: e } = await sb.rpc('borrar_lote_ventas', { p_lote: id });
        if (e) throw new Error(e.message);
        filasBorradas += Number(data ?? 0);
      }
      mostrar({ tipo: 'ok', texto: `Borrados ${ids.length} archivo(s) y ${filasBorradas.toLocaleString()} filas.` });
    } catch (e: unknown) {
      mostrar({ tipo: 'error', texto: e instanceof Error ? e.message : String(e) });
    }
    void recargar();
    void verificar();
  };

  return (
    <div>
      {nodo}
      {nodoConfirmar}
      {carga.nodo}
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Dato rotulo="Filas en la nube" valor={resumen ? resumen.filas.toLocaleString() : '—'} nota={resumen?.desde ? `${fecha(resumen.desde)} – ${fecha(resumen.hasta)}` : undefined} />
        <Dato rotulo="Archivos cargados" valor={resumen ? resumen.lotes.toLocaleString() : '—'} />
        <Dato rotulo="Sin farmacia" valor={resumen ? resumen.sin_farmacia.toLocaleString() : '—'} tono={resumen && resumen.sin_farmacia > 0 ? 'aviso' : undefined} />
        <Dato rotulo="Sin producto" valor={resumen ? resumen.sin_producto.toLocaleString() : '—'} tono={resumen && resumen.sin_producto > 0 ? 'aviso' : undefined} />
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Boton variante="primario" icono={Upload} onClick={() => void cargarArchivo()}>Cargar reporte de ventas</Boton>
        <Boton icono={RefreshCw} onClick={() => { void verificar(); void recargar(); }}>Actualizar</Boton>
        <Boton variante="fantasma" icono={Download} onClick={() => descargarCsv('plantilla_ventas_drogueria.csv', PLANTILLA)}>Plantilla</Boton>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      <TablaMaestro
        filas={filas}
        clave={(l) => l.id}
        columnas={COLUMNAS}
        buscarEn={(l) => [l.archivo]}
        placeholder="Buscar archivo"
        onEliminar={(ids) => void borrarLotes(ids)}
        cargando={cargando}
        iconoVacio={FileSpreadsheet}
        vacio={{ titulo: 'Todavía no hay ventas cargadas', texto: 'Carga el reporte mensual de cada droguería. Primero deben existir las droguerías, los productos y las farmacias.' }}
      />
    </div>
  );
}
