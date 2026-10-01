import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, FileText, Plus, Trash2 } from 'lucide-react';
import { Sheet } from '../../components/capture/Sheet';
import { Boton, BotonIcono, Campo, Grupo, Segmentado, estiloInput } from '../../components/ui/kit';
import { generarArchivoDrogueria } from '../../services/exportacionDrogueria';
import { guardarFormatoDrogueria, leerFormatoDrogueria, problemasFormato } from '../../services/maestros';
import { getSupabaseClient } from '../../services/supabaseClient';
import { FormatoRespuestaEditor } from './FormatoRespuesta';
import type { ColumnaExport, FormatoExport, LocalCliente, LocalDetalle, LocalDrogueria, LocalProducto, OrigenColumnaExport } from '../../offline/types';

/** Qué dato va en cada columna, dicho en palabras. */
const ORIGENES: { id: OrigenColumnaExport; texto: string }[] = [
  { id: 'codigo_cliente_drogueria', texto: 'Código de la farmacia en la droguería' },
  { id: 'rif_cliente', texto: 'RIF de la farmacia' },
  { id: 'nombre_cliente', texto: 'Nombre de la farmacia' },
  { id: 'codigo_producto_drogueria', texto: 'Código del producto en la droguería' },
  { id: 'descripcion_producto_drogueria', texto: 'Descripción del producto' },
  { id: 'presentacion_producto', texto: 'Presentación del producto (NOVA)' },
  { id: 'ean', texto: 'Código de barras (EAN)' },
  { id: 'sku_interno', texto: 'Código interno (Cod SAP)' },
  { id: 'unidades_solicitadas', texto: 'Unidades pedidas' },
  { id: 'unidades_confirmadas', texto: 'Unidades confirmadas (o pedidas si aún no se procesa)' },
  { id: 'descuento_linea', texto: 'Descuento del producto (%)' },
  { id: 'descuento_pedido', texto: 'Descuento del pedido (%)' },
  { id: 'descuento_total', texto: 'Descuento total de la línea (producto + pedido, %)' },
  { id: 'correlativo', texto: 'Número de pedido NOVA' },
  { id: 'fecha_pedido', texto: 'Fecha del pedido' },
  { id: 'observaciones', texto: 'Nota del vendedor' },
  { id: 'linea', texto: 'Número de línea' },
  { id: 'constante', texto: 'Valor fijo (el mismo en todas las filas)' },
];

const SEPARADORES: { v: FormatoExport['delimitador']; t: string }[] = [
  { v: ';', t: 'Punto y coma (;)' }, { v: ',', t: 'Coma (,)' }, { v: '|', t: 'Barra (|)' }, { v: '\t', t: 'Tabulador' },
];

// Pedido de ejemplo para la vista previa.
const EJEMPLO = {
  pedido: { correlativo: 'PED-1045', created_at: '2026-09-30T14:00:00Z', observaciones: 'Entregar en la mañana', estado: 'enviado_teletransferencia' as const, descuento_pedido_pct: 5 },
  cliente: { id: 'c', codigo_interno: 'CLI-001', rif: 'J-30489218-4', nombre_comercial: 'Farmacia La Paz', razon_social: 'Farmacia La Paz C.A.', estado_validacion: 'activo' } as LocalCliente,
  productos: [
    { id: 'p1', sku: '100234', ean13: '7591234567890', nombre_comercial: 'Losartán', presentacion: 'Losartán 50 mg x 30 tab', activo: true } as LocalProducto,
    { id: 'p2', sku: '100567', ean13: '7599876543210', nombre_comercial: 'Omeprazol', presentacion: 'Omeprazol 20 mg x 28 cáps', activo: true } as LocalProducto,
  ],
  detalles: [
    { id: 'd1', pedido_id: 'x', linea: 1, producto_id: 'p1', unidades_solicitadas: 10, unidades_confirmadas: null, unidades_pendientes: 10, motivo_ajuste: 'sin_quiebre', descuento_pct: 10 },
    { id: 'd2', pedido_id: 'x', linea: 2, producto_id: 'p2', unidades_solicitadas: 5, unidades_confirmadas: null, unidades_pendientes: 5, motivo_ajuste: 'sin_quiebre' },
  ] as LocalDetalle[],
};

/** Editor del archivo de pedido de una droguería: columnas, orden, separador, títulos y nombre, con vista previa. */
export function FormatoArchivo({ codigo, nombre, onCerrar, onGuardado }: { codigo: string; nombre: string; onCerrar: () => void; onGuardado: () => void }) {
  const [f, setF] = useState<FormatoExport | null>(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [pestana, setPestana] = useState<'pedido' | 'respuesta'>('pedido');

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;
    leerFormatoDrogueria(sb, codigo).then(setF, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [codigo]);

  const vista = useMemo(() => {
    if (!f) return null;
    const drogueria = { id: 'd', codigo, nombre, formato_export: f, activo: true } as LocalDrogueria;
    return generarArchivoDrogueria(
      {
        ...EJEMPLO,
        drogueria,
        mapProductos: [
          { id: 'm1', drogueria_id: 'd', producto_id: 'p1', codigo_drogueria: 'LOS-050', descripcion_drogueria: 'LOSARTAN POTASICO 50MG X30', es_principal: true },
          { id: 'm2', drogueria_id: 'd', producto_id: 'p2', codigo_drogueria: 'OME-020', descripcion_drogueria: 'OMEPRAZOL 20MG X28', es_principal: true },
        ],
        mapClientes: [{ id: 'k', drogueria_id: 'd', cliente_id: 'c', codigo_cuenta: 'C-88', es_principal: true }],
      },
      { cantidad: 'solicitadas', ahora: new Date('2026-09-30T14:00:00Z') }
    );
  }, [f, codigo, nombre]);

  if (!f) {
    return (
      <Sheet abierto titulo={`Archivos · ${nombre}`} onCerrar={onCerrar} ancho="md:max-w-3xl">
        <p className="text-sm text-slate-500">{error || 'Cargando…'}</p>
      </Sheet>
    );
  }

  const posicional = f.formato === 'txt' && f.delimitador === '';
  const cambiar = (parche: Partial<FormatoExport>) => setF({ ...f, ...parche });
  const cambiarColumna = (i: number, parche: Partial<ColumnaExport>) => cambiar({ columnas: f.columnas.map((c, k) => (k === i ? { ...c, ...parche } : c)) });
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= f.columnas.length) return;
    const cols = [...f.columnas];
    [cols[i], cols[j]] = [cols[j], cols[i]];
    cambiar({ columnas: cols });
  };
  const problemas = problemasFormato(f);

  const guardar = async () => {
    const sb = getSupabaseClient();
    if (!sb) return;
    setGuardando(true);
    setError('');
    try {
      await guardarFormatoDrogueria(sb, codigo, f);
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Sheet abierto titulo={`Archivos · ${nombre}`} onCerrar={onCerrar} ancho="md:max-w-3xl">
      <div className="flex flex-col gap-4">
        <Segmentado valor={pestana} onChange={setPestana} opciones={[{ id: 'pedido', texto: 'Pedido (lo que se envía)' }, { id: 'respuesta', texto: 'Respuesta (lo despachado)' }]} />
        {pestana === 'respuesta' ? (
          <FormatoRespuestaEditor valor={f.respuesta} onChange={(respuesta) => cambiar({ respuesta })} />
        ) : (
        <>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Así será el archivo que descarga la mesa al procesar un pedido para {nombre}. Arma las columnas en el orden que pide la droguería.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Grupo rotulo="Tipo de archivo">
            <Segmentado
              valor={posicional ? 'ancho' : f.formato}
              onChange={(v) => cambiar(v === 'ancho' ? { formato: 'txt', delimitador: '', extension: 'txt' } : v === 'txt' ? { formato: 'txt', delimitador: f.delimitador || ';', extension: 'txt' } : { formato: 'csv', delimitador: f.delimitador || ';', extension: 'csv' })}
              opciones={[{ id: 'csv', texto: 'CSV' }, { id: 'txt', texto: 'TXT' }, { id: 'ancho', texto: 'Ancho fijo' }]}
            />
          </Grupo>
          {!posicional && (
            <Campo rotulo="Separador de columnas">
              <select value={f.delimitador} onChange={(e) => cambiar({ delimitador: e.target.value as FormatoExport['delimitador'] })} className={estiloInput}>
                {SEPARADORES.map((x) => <option key={x.t} value={x.v}>{x.t}</option>)}
              </select>
            </Campo>
          )}
          <Grupo rotulo="Primera fila con títulos">
            <Segmentado valor={f.encabezado ? 'si' : 'no'} onChange={(v) => cambiar({ encabezado: v === 'si' })} opciones={[{ id: 'si', texto: 'Sí' }, { id: 'no', texto: 'No' }]} />
          </Grupo>
          {!posicional && (
            <Campo rotulo="Comillas">
              <select value={f.entrecomillado} onChange={(e) => cambiar({ entrecomillado: e.target.value as FormatoExport['entrecomillado'] })} className={estiloInput}>
                <option value="solo_texto">Solo en textos</option>
                <option value="siempre">En todo</option>
                <option value="nunca">Nunca</option>
              </select>
            </Campo>
          )}
          <Campo rotulo="Fecha">
            <select value={f.formato_fecha ?? 'YYYYMMDD'} onChange={(e) => cambiar({ formato_fecha: e.target.value as FormatoExport['formato_fecha'] })} className={estiloInput}>
              <option value="YYYYMMDD">20260930</option>
              <option value="DD/MM/YYYY">30/09/2026</option>
              <option value="YYYY-MM-DD">2026-09-30</option>
            </select>
          </Campo>
          <Grupo rotulo="Decimales">
            <Segmentado valor={f.decimal ?? 'punto'} onChange={(v) => cambiar({ decimal: v as FormatoExport['decimal'] })} opciones={[{ id: 'punto', texto: '1.5' }, { id: 'coma', texto: '1,5' }]} />
          </Grupo>
          <Campo rotulo="Codificación" ayuda="Si la droguería ve mal las tildes, prueba Windows (ANSI).">
            <select value={f.codificacion} onChange={(e) => cambiar({ codificacion: e.target.value as FormatoExport['codificacion'] })} className={estiloInput}>
              <option value="utf-8">UTF-8</option>
              <option value="windows-1252">Windows (ANSI)</option>
              <option value="iso-8859-1">ISO-8859-1</option>
            </select>
          </Campo>
          <Campo rotulo="Nombre del archivo" ayuda="Usa {correlativo}, {fecha}, {drogueria}, {cliente} y {extension}.">
            <input value={f.nombre_archivo ?? '{correlativo}_{fecha}.{extension}'} onChange={(e) => cambiar({ nombre_archivo: e.target.value })} className={estiloInput} />
          </Campo>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Columnas</h3>
            <Boton tamano="sm" icono={Plus} onClick={() => cambiar({ columnas: [...f.columnas, { encabezado: 'COLUMNA', origen: 'constante', valor: '' }] })}>Columna</Boton>
          </div>
          <ol className="flex flex-col gap-2">
            {f.columnas.map((c, i) => (
              <li key={i} className="grid gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800 sm:grid-cols-[2rem_minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-center">
                <span className="hidden text-center text-xs font-medium text-slate-500 sm:block">{i + 1}</span>
                <input value={c.encabezado} onChange={(e) => cambiarColumna(i, { encabezado: e.target.value })} aria-label={`Título de la columna ${i + 1}`} placeholder="Título" className={estiloInput} />
                <div className="flex gap-2">
                  <select value={c.origen} onChange={(e) => cambiarColumna(i, { origen: e.target.value as OrigenColumnaExport })} aria-label={`Dato de la columna ${i + 1}`} className={`${estiloInput} min-w-0 flex-1`}>
                    {ORIGENES.map((o) => <option key={o.id} value={o.id}>{o.texto}</option>)}
                  </select>
                  {c.origen.startsWith('descuento_') && (
                    <select value={c.formato === 'entero' ? 'entero' : 'decimal'} onChange={(e) => cambiarColumna(i, { formato: e.target.value as ColumnaExport['formato'] })} aria-label="Formato del descuento" className={`${estiloInput} w-24`}>
                      <option value="decimal">7.5</option>
                      <option value="entero">8 (entero)</option>
                    </select>
                  )}
                  {c.origen === 'constante' && <input value={c.valor ?? ''} onChange={(e) => cambiarColumna(i, { valor: e.target.value })} aria-label="Valor fijo" placeholder="Valor" className={`${estiloInput} w-24`} />}
                  {posicional && <input value={c.ancho ?? ''} onChange={(e) => cambiarColumna(i, { ancho: Number(e.target.value.replace(/\D/g, '')) || undefined })} inputMode="numeric" aria-label="Ancho" placeholder="Ancho" className={`${estiloInput} w-20`} />}
                </div>
                <div className="flex justify-end">
                  <BotonIcono icono={ArrowUp} etiqueta="Subir" onClick={() => mover(i, -1)} />
                  <BotonIcono icono={ArrowDown} etiqueta="Bajar" onClick={() => mover(i, 1)} />
                  <BotonIcono icono={Trash2} etiqueta="Quitar columna" onClick={() => cambiar({ columnas: f.columnas.filter((_, k) => k !== i) })} />
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white"><FileText className="h-4 w-4" aria-hidden /> Vista previa · {vista?.nombre_archivo}</h3>
          <pre className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">{vista?.texto.replace(/\t/g, '→') || '—'}</pre>
          <p className="mt-1 text-xs text-slate-500">Ejemplo con dos productos de un pedido de Farmacia La Paz (Losartán con 10% de descuento del producto y 5% de descuento del pedido).</p>
        </div>
        </>
        )}

        {(problemas.length > 0 || error) && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{[...problemas, error].filter(Boolean).join(' ')}</p>}
        <div className="flex justify-end gap-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="primario" disabled={guardando || problemas.length > 0} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar formato'}</Boton>
        </div>
      </div>
    </Sheet>
  );
}
