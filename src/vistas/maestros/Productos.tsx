import { useCallback, useState } from 'react';
import { Download, Pill, Plus, Upload } from 'lucide-react';
import { Sheet } from '../../components/capture/Sheet';
import { TablaMaestro } from '../../components/maestros/TablaMaestro';
import type { Columna } from '../../components/maestros/TablaMaestro';
import { descargarCsv, elegirArchivo, subirCatalogo, useCargaArchivo } from '../../components/import/useCargaArchivo';
import { Avatar, Boton, Campo, Etiqueta, estiloInput, useAviso, useConfirmar } from '../../components/ui/kit';
import { getSupabaseClient } from '../../services/supabaseClient';
import { eliminarRegistros, guardarProducto, listarProductos } from '../../services/maestros';
import type { FilaProducto } from '../../services/maestros';
import { leerCsv, prepararProductos } from '../../services/cargaArchivos';
import { importarCatalogoProductos } from '../../services/nubeV3';
import { nulo, useListaNube } from './comun';

const PLANTILLA = 'Codigo;Descripcion;Unidad de Negocio;Clase Terapeutica;Clasificacion Portafolio;Pack;Concatenate Molecule (Spanish);Pack Code;Empaque minimo;Estado\r\n' +
  'SKU-LOS-50;Losartan Potasico 50mg x 30 Tabletas;La Sante;Antihipertensivo;Estrategico;Caja x 30 Tabletas;Losartan Potasico;7590000000000;1;Activo';

const COLUMNAS: Columna<FilaProducto>[] = [
  {
    titulo: 'Producto',
    celda: (p) => (
      <div className="flex items-center gap-3">
        <Avatar nombre={p.nombre_comercial} foto={p.foto_url} tamano={36} cuadrado />
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900 dark:text-white">{p.nombre_comercial}</p>
          <p className="truncate text-xs text-slate-500">{[p.presentacion, p.principio_activo].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
    ),
  },
  { titulo: 'Cod SAP', celda: (p) => <span className="font-mono text-xs">{p.sku}</span> },
  { titulo: 'Unidad de negocio', celda: (p) => p.laboratorio ?? '—', secundaria: true },
  { titulo: 'Categoría', celda: (p) => p.categoria ?? '—', secundaria: true },
  { titulo: 'Empaque', celda: (p) => p.empaque_minimo, secundaria: true, alinear: 'derecha' },
  { titulo: 'Estado', celda: (p) => (<span className="flex flex-wrap gap-1">{!p.activo && <Etiqueta tono="neutro">Inactivo</Etiqueta>}{p.es_prioritario && <Etiqueta tono="marca">Prioritario</Etiqueta>}{p.activo && !p.es_prioritario && <Etiqueta tono="exito">Activo</Etiqueta>}</span>) },
];

const vacio = (): FilaProducto => ({ sku: '', nombre_comercial: '', presentacion: null, principio_activo: null, laboratorio: null, categoria: null, clase_terapeutica: null, ean13: null, empaque_minimo: 1, es_prioritario: false, activo: true, foto_url: null });

/** Productos: buscar, crear, editar (con foto opcional), cargar por archivo y eliminar uno o varios. */
export function Productos() {
  const cargar = useCallback(listarProductos, []);
  const { filas, cargando, error, recargar } = useListaNube(cargar);
  const [edicion, setEdicion] = useState<{ fila: FilaProducto; nuevo: boolean } | null>(null);
  const { mostrar, nodo } = useAviso();
  const { confirmar, nodo: nodoConfirmar } = useConfirmar();
  const carga = useCargaArchivo();

  const eliminar = async (claves: string[]) => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const ok = await confirmar(`Eliminar ${claves.length} producto${claves.length === 1 ? '' : 's'}`, 'Dejarán de aparecer en el catálogo de todos. Los pedidos y ventas que los incluyen se conservan. Volver a cargarlos con el mismo código los restaura.', { accion: 'Eliminar', peligro: true });
    if (!ok) return;
    try {
      const n = await eliminarRegistros(sb, 'productos', claves);
      mostrar({ tipo: 'ok', texto: `${n} producto${n === 1 ? '' : 's'} eliminado${n === 1 ? '' : 's'}.` });
      void recargar();
    } catch (e: unknown) {
      mostrar({ tipo: 'error', texto: e instanceof Error ? e.message : String(e) });
    }
  };

  const cargarArchivo = async () => {
    const sb = getSupabaseClient();
    const archivo = await elegirArchivo();
    if (!sb || !archivo) return;
    const leido = leerCsv(archivo.texto);
    const prep = prepararProductos(leido);
    carga.pedir(
      { titulo: 'Cargar productos', archivo: archivo.nombre, unidad: 'productos', leidas: leido.filas.length, prep },
      (avance) => subirCatalogo('productos', prep.registros.length, prep.descartes.length, (a) => importarCatalogoProductos(sb, prep.registros, a), avance),
      () => void recargar()
    );
  };

  return (
    <div>
      {nodo}
      {nodoConfirmar}
      {carga.nodo}
      <div className="mb-3 flex flex-wrap gap-2">
        <Boton variante="primario" icono={Plus} onClick={() => setEdicion({ fila: vacio(), nuevo: true })}>Nuevo producto</Boton>
        <Boton icono={Upload} onClick={() => void cargarArchivo()}>Cargar archivo</Boton>
        <Boton variante="fantasma" icono={Download} onClick={() => descargarCsv('plantilla_productos.csv', PLANTILLA)}>Plantilla</Boton>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      <TablaMaestro
        filas={filas}
        clave={(p) => p.sku}
        columnas={COLUMNAS}
        buscarEn={(p) => [p.sku, p.nombre_comercial, p.presentacion, p.principio_activo, p.laboratorio, p.categoria, p.ean13]}
        placeholder="Buscar por nombre, Cod SAP, molécula o código de barras"
        onAbrir={(p) => setEdicion({ fila: p, nuevo: false })}
        onEliminar={(c) => void eliminar(c)}
        cargando={cargando}
        iconoVacio={Pill}
        vacio={{ titulo: 'Todavía no hay productos', texto: 'Crea uno o carga tu archivo de productos (descarga la plantilla para ver el formato).' }}
      />
      {edicion && (
        <FormProducto
          inicial={edicion.fila}
          nuevo={edicion.nuevo}
          onCerrar={() => setEdicion(null)}
          onGuardado={(nombre) => { setEdicion(null); mostrar({ tipo: 'ok', texto: `${nombre} guardado.` }); void recargar(); }}
          onEliminar={edicion.nuevo ? undefined : () => { setEdicion(null); void eliminar([edicion.fila.sku]); }}
        />
      )}
    </div>
  );
}

function FormProducto({ inicial, nuevo, onCerrar, onGuardado, onEliminar }: { inicial: FilaProducto; nuevo: boolean; onCerrar: () => void; onGuardado: (nombre: string) => void; onEliminar?: () => void }) {
  const [p, setP] = useState(inicial);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const campo = (k: keyof FilaProducto) => ({ value: (p[k] as string | null) ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: e.target.value }) });

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabaseClient();
    if (!sb) return;
    if (!p.sku.trim() || !p.nombre_comercial.trim()) return setError('El Cod SAP y el nombre son obligatorios.');
    setGuardando(true);
    try {
      await guardarProducto(sb, {
        ...p,
        sku: p.sku.trim(), nombre_comercial: p.nombre_comercial.trim(), presentacion: nulo(p.presentacion), principio_activo: nulo(p.principio_activo),
        laboratorio: nulo(p.laboratorio), categoria: nulo(p.categoria), clase_terapeutica: nulo(p.clase_terapeutica), ean13: nulo(p.ean13),
        foto_url: nulo(p.foto_url), empaque_minimo: Math.max(1, Math.round(Number(p.empaque_minimo) || 1)),
      });
      onGuardado(p.nombre_comercial);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Sheet abierto titulo={nuevo ? 'Nuevo producto' : p.nombre_comercial} onCerrar={onCerrar} ancho="md:max-w-2xl">
      <form onSubmit={guardar} className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3 sm:col-span-2">
          <Avatar nombre={p.nombre_comercial || 'Producto'} foto={p.foto_url} tamano={64} cuadrado />
          <Campo rotulo="Foto (dirección web de la imagen)" ayuda="Opcional. Pronto se podrá subir desde el teléfono." className="flex-1"><input {...campo('foto_url')} inputMode="url" placeholder="https://…" className={estiloInput} /></Campo>
        </div>
        <Campo rotulo="Cod SAP"><input required disabled={!nuevo} {...campo('sku')} className={estiloInput} /></Campo>
        <Campo rotulo="Nombre"><input required {...campo('nombre_comercial')} className={estiloInput} /></Campo>
        <Campo rotulo="Presentación"><input {...campo('presentacion')} className={estiloInput} /></Campo>
        <Campo rotulo="Principio activo"><input {...campo('principio_activo')} className={estiloInput} /></Campo>
        <Campo rotulo="Unidad de negocio"><input {...campo('laboratorio')} className={estiloInput} /></Campo>
        <Campo rotulo="Categoría"><input {...campo('categoria')} className={estiloInput} /></Campo>
        <Campo rotulo="Clase terapéutica"><input {...campo('clase_terapeutica')} className={estiloInput} /></Campo>
        <Campo rotulo="Código de barras"><input {...campo('ean13')} inputMode="numeric" className={estiloInput} /></Campo>
        <Campo rotulo="Empaque mínimo (unidades)"><input type="number" min={1} value={p.empaque_minimo} onChange={(e) => setP({ ...p, empaque_minimo: Number(e.target.value) })} className={estiloInput} /></Campo>
        <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={p.activo} onChange={(e) => setP({ ...p, activo: e.target.checked })} className="h-4 w-4 accent-marca-700" /> Activo</label>
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={p.es_prioritario} onChange={(e) => setP({ ...p, es_prioritario: e.target.checked })} className="h-4 w-4 accent-marca-700" /> Prioritario (se sugiere primero)</label>
        </div>
        {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300 sm:col-span-2">{error}</p>}
        <div className="flex flex-wrap justify-between gap-2 sm:col-span-2">
          {onEliminar ? <Boton variante="fantasma" className="!text-rose-700 dark:!text-rose-300" onClick={onEliminar}>Eliminar</Boton> : <span />}
          <div className="flex gap-2">
            <Boton onClick={onCerrar}>Cancelar</Boton>
            <Boton type="submit" variante="primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
