import { useCallback, useState } from 'react';
import { Building2, Download, FileCog, Plus, Upload } from 'lucide-react';
import { FormatoArchivo } from './FormatoArchivo';
import { Sheet } from '../../components/capture/Sheet';
import { TablaMaestro } from '../../components/maestros/TablaMaestro';
import type { Columna } from '../../components/maestros/TablaMaestro';
import { descargarCsv, elegirArchivo, subirCatalogo, useCargaArchivo } from '../../components/import/useCargaArchivo';
import { Boton, Campo, Etiqueta, estiloInput, useAviso, useConfirmar } from '../../components/ui/kit';
import { getSupabaseClient } from '../../services/supabaseClient';
import { eliminarRegistros, guardarDrogueria, listarDroguerias } from '../../services/maestros';
import type { FilaDrogueria } from '../../services/maestros';
import { leerCsv, prepararDroguerias } from '../../services/cargaArchivos';
import { importarCatalogoDroguerias } from '../../services/nubeV3';
import { nulo, numeroONulo, useListaNube } from './comun';

const PLANTILLA = 'NOMBRE_DROGUERIA;CODIGO_DROGUERIA;RIF;EMAIL_PEDIDOS;TELEFONO;DELIMITADOR_CSV\r\nCOBECA;COBECA;;;;\r\nDROCERCA;DROCERCA;;;;';
const SEPARADORES = [{ v: ';', t: 'Punto y coma (;)' }, { v: ',', t: 'Coma (,)' }, { v: '|', t: 'Barra (|)' }, { v: '\t', t: 'Tabulador' }];
const nombreSeparador = (v: string) => SEPARADORES.find((s) => s.v === v)?.t ?? v;

const COLUMNAS: Columna<FilaDrogueria>[] = [
  { titulo: 'Droguería', celda: (d) => (<><p className="font-medium text-slate-900 dark:text-white">{d.nombre}</p><p className="font-mono text-xs text-slate-500">{d.codigo}</p></>) },
  { titulo: 'Correo de pedidos', celda: (d) => d.email_pedidos ?? '—', secundaria: true },
  { titulo: 'Teléfono', celda: (d) => d.telefono ?? '—', secundaria: true },
  { titulo: 'Archivo', celda: (d) => nombreSeparador(d.delimitador), secundaria: true },
  { titulo: 'Estado', celda: (d) => (d.activo ? <Etiqueta tono="exito">Activa</Etiqueta> : <Etiqueta>Inactiva</Etiqueta>) },
];

const vacia = (): FilaDrogueria => ({ codigo: '', nombre: '', rif: null, email_pedidos: null, telefono: null, dias_entrega: null, activo: true, delimitador: ';' });

/** Droguerías: buscar, crear, editar, cargar por archivo y eliminar una o varias. */
export function Droguerias() {
  const cargar = useCallback(listarDroguerias, []);
  const { filas, cargando, error, recargar } = useListaNube(cargar);
  const [edicion, setEdicion] = useState<{ fila: FilaDrogueria; nueva: boolean } | null>(null);
  const [formato, setFormato] = useState<{ codigo: string; nombre: string } | null>(null);
  const { mostrar, nodo } = useAviso();
  const { confirmar, nodo: nodoConfirmar } = useConfirmar();
  const carga = useCargaArchivo();

  const eliminar = async (claves: string[]) => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const ok = await confirmar(`Eliminar ${claves.length} droguería${claves.length === 1 ? '' : 's'}`, 'No se podrán elegir en pedidos nuevos. Los pedidos, ventas y homologaciones existentes se conservan.', { accion: 'Eliminar', peligro: true });
    if (!ok) return;
    try {
      const n = await eliminarRegistros(sb, 'droguerias', claves);
      mostrar({ tipo: 'ok', texto: `${n} droguería${n === 1 ? '' : 's'} eliminada${n === 1 ? '' : 's'}.` });
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
    const prep = prepararDroguerias(leido);
    carga.pedir(
      { titulo: 'Cargar droguerías', archivo: archivo.nombre, unidad: 'droguerías', leidas: leido.filas.length, prep },
      (avance) => subirCatalogo('droguerías', prep.registros.length, prep.descartes.length, (a) => importarCatalogoDroguerias(sb, prep.registros, a), avance),
      () => void recargar()
    );
  };

  return (
    <div>
      {nodo}
      {nodoConfirmar}
      {carga.nodo}
      <div className="mb-3 flex flex-wrap gap-2">
        <Boton variante="primario" icono={Plus} onClick={() => setEdicion({ fila: vacia(), nueva: true })}>Nueva droguería</Boton>
        <Boton icono={Upload} onClick={() => void cargarArchivo()}>Cargar archivo</Boton>
        <Boton variante="fantasma" icono={Download} onClick={() => descargarCsv('plantilla_droguerias.csv', PLANTILLA)}>Plantilla</Boton>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      <TablaMaestro
        filas={filas}
        clave={(d) => d.codigo}
        columnas={COLUMNAS}
        buscarEn={(d) => [d.codigo, d.nombre, d.email_pedidos, d.rif]}
        placeholder="Buscar droguería"
        onAbrir={(d) => setEdicion({ fila: d, nueva: false })}
        onEliminar={(c) => void eliminar(c)}
        cargando={cargando}
        iconoVacio={Building2}
        vacio={{ titulo: 'Todavía no hay droguerías', texto: 'Son el primer dato a cargar: las ventas y los pedidos las necesitan.' }}
      />
      {edicion && (
        <FormDrogueria
          inicial={edicion.fila}
          nueva={edicion.nueva}
          onCerrar={() => setEdicion(null)}
          onGuardada={(nombre) => { setEdicion(null); mostrar({ tipo: 'ok', texto: `${nombre} guardada.` }); void recargar(); }}
          onEliminar={edicion.nueva ? undefined : () => { setEdicion(null); void eliminar([edicion.fila.codigo]); }}
          onFormato={edicion.nueva ? undefined : () => { setFormato({ codigo: edicion.fila.codigo, nombre: edicion.fila.nombre }); setEdicion(null); }}
        />
      )}
      {formato && (
        <FormatoArchivo
          codigo={formato.codigo}
          nombre={formato.nombre}
          onCerrar={() => setFormato(null)}
          onGuardado={() => { mostrar({ tipo: 'ok', texto: `Formato de ${formato.nombre} guardado. Los próximos archivos saldrán así.` }); setFormato(null); void recargar(); }}
        />
      )}
    </div>
  );
}

function FormDrogueria({ inicial, nueva, onCerrar, onGuardada, onEliminar, onFormato }: { inicial: FilaDrogueria; nueva: boolean; onCerrar: () => void; onGuardada: (nombre: string) => void; onEliminar?: () => void; onFormato?: () => void }) {
  const [d, setD] = useState(inicial);
  const [dias, setDias] = useState(inicial.dias_entrega?.toString() ?? '');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const campo = (k: keyof FilaDrogueria) => ({ value: (d[k] as string | null) ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value }) });

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabaseClient();
    if (!sb) return;
    if (!d.nombre.trim()) return setError('El nombre es obligatorio.');
    const codigo = (d.codigo.trim() || d.nombre.toUpperCase().replace(/[^A-Z0-9]+/g, '')).toUpperCase();
    setGuardando(true);
    try {
      const n = numeroONulo(dias);
      await guardarDrogueria(sb, { ...d, codigo, nombre: d.nombre.trim(), rif: nulo(d.rif), email_pedidos: nulo(d.email_pedidos), telefono: nulo(d.telefono), dias_entrega: n === null ? null : Math.round(n) });
      onGuardada(d.nombre);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Sheet abierto titulo={nueva ? 'Nueva droguería' : d.nombre} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nombre"><input required {...campo('nombre')} className={estiloInput} /></Campo>
        <Campo rotulo="Código" ayuda={nueva ? 'Si lo dejas vacío se usa el nombre.' : undefined}><input disabled={!nueva} {...campo('codigo')} className={estiloInput} /></Campo>
        <Campo rotulo="RIF"><input {...campo('rif')} className={estiloInput} /></Campo>
        <Campo rotulo="Teléfono"><input {...campo('telefono')} inputMode="tel" className={estiloInput} /></Campo>
        <Campo rotulo="Correo para pedidos" className="sm:col-span-2"><input {...campo('email_pedidos')} type="email" className={estiloInput} /></Campo>
        <Campo rotulo="Días de entrega"><input value={dias} onChange={(e) => setDias(e.target.value)} inputMode="numeric" className={estiloInput} /></Campo>
        {nueva ? (
          <Campo rotulo="Separador del archivo de pedidos" ayuda="Después de crearla podrás armar todas las columnas del archivo.">
            <select value={d.delimitador} onChange={(e) => setD({ ...d, delimitador: e.target.value })} className={estiloInput}>
              {SEPARADORES.map((x) => <option key={x.t} value={x.v}>{x.t}</option>)}
            </select>
          </Campo>
        ) : (
          <div className="flex flex-col justify-end">
            <Boton icono={FileCog} onClick={onFormato}>Formato del archivo de pedido</Boton>
          </div>
        )}
        <label className="inline-flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={d.activo} onChange={(e) => setD({ ...d, activo: e.target.checked })} className="h-4 w-4 accent-marca-700" /> Activa (se puede elegir en los pedidos)</label>
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
