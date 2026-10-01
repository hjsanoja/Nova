import { useMemo, useState } from 'react';
import { FileSpreadsheet, FileUp } from 'lucide-react';
import { BotonArchivo, Campo, Grupo, Segmentado, estiloInput } from '../../components/ui/kit';
import type { CampoRespuesta, FormatoRespuesta } from '../../offline/types';
import { ErrorArchivo, leerArchivoTabla } from '../../services/leerHoja';
import type { Tabla } from '../../services/leerHoja';
import { CAMPOS_RESPUESTA, leerRespuesta } from '../../services/respuestaDrogueria';

const VACIO: FormatoRespuesta = { columnas: {} };

/**
 * Cómo leer el archivo con el que la droguería responde (lo despachado). Se prueba con un archivo real: NOVA muestra
 * qué columna reconoció para cada dato y se corrige lo que haga falta.
 */
export function FormatoRespuestaEditor({ valor, onChange }: { valor?: FormatoRespuesta; onChange: (v: FormatoRespuesta) => void }) {
  const f = valor ?? VACIO;
  const [muestra, setMuestra] = useState<{ nombre: string; tabla: Tabla } | null>(null);
  const [error, setError] = useState('');
  const leida = useMemo(() => (muestra ? leerRespuesta(muestra.tabla, f) : null), [muestra, f]);
  const cambiar = (parche: Partial<FormatoRespuesta>) => onChange({ ...f, ...parche });
  const cambiarColumna = (campo: CampoRespuesta, titulo: string) => {
    const columnas = { ...f.columnas };
    if (titulo) columnas[campo] = titulo;
    else delete columnas[campo];
    cambiar({ columnas });
  };

  const abrir = async (archivo: File) => {
    setError('');
    try {
      setMuestra({ nombre: archivo.name, tabla: await leerArchivoTabla(archivo, f.hoja) });
    } catch (e) {
      setMuestra(null);
      setError(e instanceof ErrorArchivo ? e.message : String(e));
    }
  };

  // Columna que se usará para cada dato: la guardada o, con un archivo de prueba, la reconocida.
  const usada = (campo: CampoRespuesta) => {
    if (f.columnas[campo]) return f.columnas[campo] as string;
    const i = leida?.columnas[campo];
    return i === undefined ? '' : leida?.encabezados[i] ?? '';
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Cuando la droguería devuelve un Excel o CSV con lo que despachó, la mesa lo sube en <b>Por procesar → Cargar respuesta</b> y NOVA llena las unidades confirmadas.
        Si no configuras nada, NOVA adivina las columnas por sus títulos. Prueba con un archivo real para ver qué reconoce.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <BotonArchivo icono={FileUp} accept=".xlsx,.csv,.txt,text/csv" onArchivo={(a) => void abrir(a)}>Probar con un archivo</BotonArchivo>
        {muestra && <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500"><FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden /><span className="truncate">{muestra.nombre}{muestra.tabla.hojas?.length ? ` · hojas: ${muestra.tabla.hojas.join(', ')}` : ''}</span></span>}
      </div>
      {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Fila de los títulos" ayuda={leida ? `En el archivo de prueba: fila ${leida.filaEncabezado}.` : 'Vacío = NOVA la busca sola.'}>
          <input value={f.fila_encabezado ?? ''} onChange={(e) => cambiar({ fila_encabezado: Number(e.target.value.replace(/\D/g, '')) || undefined })} inputMode="numeric" placeholder="Automática" className={estiloInput} />
        </Campo>
        <Campo rotulo="Hoja del Excel" ayuda="Vacío = la primera hoja.">
          <input value={f.hoja ?? ''} onChange={(e) => cambiar({ hoja: e.target.value || undefined })} placeholder="Primera hoja" list="hojas-respuesta" className={estiloInput} />
        </Campo>
        <Campo rotulo="El código del producto es">
          <select value={f.codigo_producto ?? 'auto'} onChange={(e) => cambiar({ codigo_producto: e.target.value as FormatoRespuesta['codigo_producto'] })} className={estiloInput}>
            <option value="auto">Cualquiera (prueba todos)</option>
            <option value="drogueria">El código de la droguería</option>
            <option value="ean">El código de barras (EAN)</option>
            <option value="sku">El código interno (Cod SAP)</option>
          </select>
        </Campo>
        <Grupo rotulo="Si un producto del pedido no viene en el archivo">
          <Segmentado valor={f.ausentes ?? 'cero'} onChange={(v) => cambiar({ ausentes: v })} opciones={[{ id: 'cero', texto: 'No se despachó' }, { id: 'completas', texto: 'Se despachó completo' }]} />
        </Grupo>
      </div>
      <datalist id="hojas-respuesta">{muestra?.tabla.hojas?.map((h) => <option key={h} value={h} />)}</datalist>
      <datalist id="titulos-respuesta">{leida?.encabezados.filter(Boolean).map((h) => <option key={h} value={h} />)}</datalist>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Columnas del archivo</h3>
        <ul className="flex flex-col gap-2">
          {CAMPOS_RESPUESTA.map((c) => (
            <li key={c.id} className="grid gap-1 rounded-xl border border-slate-200 p-2 dark:border-slate-800 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-3">
              <div>
                <p className="text-sm font-semibold">{c.texto}</p>
                <p className="text-xs text-slate-500">{c.ayuda}</p>
              </div>
              <input
                value={f.columnas[c.id] ?? ''}
                onChange={(e) => cambiarColumna(c.id, e.target.value)}
                list="titulos-respuesta"
                aria-label={`Título de la columna: ${c.texto}`}
                placeholder={usada(c.id) ? `Reconocida: ${usada(c.id)}` : 'Automática'}
                className={estiloInput}
              />
            </li>
          ))}
        </ul>
      </div>

      {leida && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Así lo leo</h3>
          {leida.problemas.length > 0 && <div role="alert" className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{leida.problemas.map((p) => <p key={p}>{p}</p>)}</div>}
          {leida.filas.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/60">
                  <tr><th className="px-2 py-1.5">Fila</th><th className="px-2">Pedido</th><th className="px-2">Farmacia</th><th className="px-2">Producto</th><th className="px-2 text-right">Despachadas</th><th className="px-2 text-right">Faltan</th><th className="px-2">Motivo</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {leida.filas.slice(0, 6).map((r) => (
                    <tr key={r.linea}><td className="px-2 py-1 text-slate-400">{r.linea}</td><td className="px-2">{r.pedido || '—'}</td><td className="px-2">{r.cliente || '—'}</td><td className="px-2">{r.producto}</td><td className="px-2 text-right">{r.confirmadas ?? '—'}</td><td className="px-2 text-right">{r.faltantes ?? '—'}</td><td className="px-2">{r.motivo || '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {leida.filas.length > 6 && <p className="mt-1 text-xs text-slate-500">…y {leida.filas.length - 6} filas más.</p>}
        </div>
      )}
    </div>
  );
}
