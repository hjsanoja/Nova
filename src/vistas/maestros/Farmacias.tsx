import { useCallback, useState } from 'react';
import { Download, Plus, Store, Upload } from 'lucide-react';
import { Sheet } from '../../components/capture/Sheet';
import { TablaMaestro } from '../../components/maestros/TablaMaestro';
import type { Columna } from '../../components/maestros/TablaMaestro';
import { descargarCsv, elegirArchivo, subirCatalogo, useCargaArchivo } from '../../components/import/useCargaArchivo';
import { Boton, Campo, estiloInput, useAviso, useConfirmar } from '../../components/ui/kit';
import { getSupabaseClient } from '../../services/supabaseClient';
import { eliminarRegistros, guardarFarmacia, listarFarmacias } from '../../services/maestros';
import type { FilaFarmacia } from '../../services/maestros';
import { leerCsv, prepararClientes } from '../../services/cargaArchivos';
import { importarCatalogoClientes } from '../../services/nubeV3';
import { nulo, numeroONulo, useListaNube } from './comun';

const PLANTILLA = 'ident01;razon social;nombre de fantasia;rif;brick;municipio;estado;direccion;telefono;bandera;frecuencia;local_gps_lat;local_gps_lon\r\n' +
  'CLI-1001;Farmacia Ejemplo C.A.;Farmacia Ejemplo;J-12345678-9;CCS-01;Chacao;Miranda;Av. Principal;0212-0000000;Independiente;Semanal;10.4925;-66.8533';

const FRECUENCIAS = [{ v: '', t: 'Sin definir' }, { v: '7', t: 'Semanal' }, { v: '15', t: 'Quincenal' }, { v: '30', t: 'Mensual' }, { v: '60', t: 'Bimestral' }];

const COLUMNAS: Columna<FilaFarmacia>[] = [
  { titulo: 'Código', celda: (f) => <span className="font-mono text-xs">{f.codigo_interno}</span> },
  { titulo: 'Farmacia', celda: (f) => (<><p className="font-medium text-slate-900 dark:text-white">{f.nombre_comercial}</p><p className="text-xs text-slate-500">{f.razon_social}</p></>) },
  { titulo: 'RIF', celda: (f) => f.rif ?? '—', secundaria: true },
  { titulo: 'Zona', celda: (f) => f.brick ?? '—', secundaria: true },
  { titulo: 'Municipio', celda: (f) => [f.municipio, f.estado_geografico].filter(Boolean).join(', ') || '—', secundaria: true },
  { titulo: 'Cadena', celda: (f) => f.bandera ?? '—', secundaria: true },
];

const vacia = (): FilaFarmacia => ({ codigo_interno: '', razon_social: '', nombre_comercial: '', rif: null, brick: null, municipio: null, estado_geografico: null, direccion: null, telefono: null, bandera: null, frecuencia_dias: null, lat: null, lon: null });

/** Farmacias (clientes): buscar, crear, editar, cargar por archivo y eliminar una o varias. */
export function Farmacias() {
  const cargar = useCallback(listarFarmacias, []);
  const { filas, cargando, error, recargar } = useListaNube(cargar);
  const [edicion, setEdicion] = useState<{ fila: FilaFarmacia; nueva: boolean } | null>(null);
  const { mostrar, nodo } = useAviso();
  const { confirmar, nodo: nodoConfirmar } = useConfirmar();
  const carga = useCargaArchivo();

  const eliminar = async (claves: string[]) => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const ok = await confirmar(`Eliminar ${claves.length} farmacia${claves.length === 1 ? '' : 's'}`, 'Dejarán de aparecer para todos los usuarios y se retiran de los ficheros. Sus pedidos y ventas se conservan. Volver a cargarlas con el mismo código las restaura.', { accion: 'Eliminar', peligro: true });
    if (!ok) return;
    try {
      const n = await eliminarRegistros(sb, 'clientes', claves);
      mostrar({ tipo: 'ok', texto: `${n} farmacia${n === 1 ? '' : 's'} eliminada${n === 1 ? '' : 's'}.` });
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
    const prep = prepararClientes(leido);
    carga.pedir(
      { titulo: 'Cargar farmacias', archivo: archivo.nombre, unidad: 'farmacias', leidas: leido.filas.length, prep },
      (avance) => subirCatalogo('farmacias', prep.registros.length, prep.descartes.length, (a) => importarCatalogoClientes(sb, prep.registros, a), avance),
      () => void recargar()
    );
  };

  return (
    <div>
      {nodo}
      {nodoConfirmar}
      {carga.nodo}
      <div className="mb-3 flex flex-wrap gap-2">
        <Boton variante="primario" icono={Plus} onClick={() => setEdicion({ fila: vacia(), nueva: true })}>Nueva farmacia</Boton>
        <Boton icono={Upload} onClick={() => void cargarArchivo()}>Cargar archivo</Boton>
        <Boton variante="fantasma" icono={Download} onClick={() => descargarCsv('plantilla_farmacias.csv', PLANTILLA)}>Plantilla</Boton>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      <TablaMaestro
        filas={filas}
        clave={(f) => f.codigo_interno}
        columnas={COLUMNAS}
        buscarEn={(f) => [f.codigo_interno, f.nombre_comercial, f.razon_social, f.rif, f.brick, f.municipio, f.estado_geografico, f.bandera]}
        placeholder="Buscar por nombre, código, RIF, zona o municipio"
        onAbrir={(f) => setEdicion({ fila: f, nueva: false })}
        onEliminar={(c) => void eliminar(c)}
        cargando={cargando}
        iconoVacio={Store}
        vacio={{ titulo: 'Todavía no hay farmacias', texto: 'Crea una o carga tu archivo de clientes (descarga la plantilla para ver el formato).' }}
      />
      {edicion && (
        <FormFarmacia
          inicial={edicion.fila}
          nueva={edicion.nueva}
          onCerrar={() => setEdicion(null)}
          onGuardada={(nombre) => { setEdicion(null); mostrar({ tipo: 'ok', texto: `${nombre} guardada.` }); void recargar(); }}
          onEliminar={edicion.nueva ? undefined : () => { setEdicion(null); void eliminar([edicion.fila.codigo_interno]); }}
        />
      )}
    </div>
  );
}

function FormFarmacia({ inicial, nueva, onCerrar, onGuardada, onEliminar }: { inicial: FilaFarmacia; nueva: boolean; onCerrar: () => void; onGuardada: (nombre: string) => void; onEliminar?: () => void }) {
  const [f, setF] = useState(inicial);
  const [lat, setLat] = useState(inicial.lat?.toString() ?? '');
  const [lon, setLon] = useState(inicial.lon?.toString() ?? '');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const campo = (k: keyof FilaFarmacia) => ({ value: (f[k] as string | null) ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }) });

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabaseClient();
    if (!sb) return;
    if (!f.codigo_interno.trim()) return setError('El código interno es obligatorio.');
    if (!f.nombre_comercial.trim() && !f.razon_social.trim()) return setError('Escribe el nombre comercial o la razón social.');
    setGuardando(true);
    try {
      await guardarFarmacia(sb, {
        ...f,
        codigo_interno: f.codigo_interno.trim(),
        nombre_comercial: (f.nombre_comercial || f.razon_social).trim(),
        razon_social: (f.razon_social || f.nombre_comercial).trim(),
        rif: nulo(f.rif), brick: nulo(f.brick), municipio: nulo(f.municipio), estado_geografico: nulo(f.estado_geografico),
        direccion: nulo(f.direccion), telefono: nulo(f.telefono), bandera: nulo(f.bandera),
        lat: numeroONulo(lat), lon: numeroONulo(lon),
      });
      onGuardada(f.nombre_comercial || f.razon_social);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Sheet abierto titulo={nueva ? 'Nueva farmacia' : f.nombre_comercial} onCerrar={onCerrar} ancho="md:max-w-2xl">
      <form onSubmit={guardar} className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Código interno (ident01)"><input required disabled={!nueva} {...campo('codigo_interno')} className={estiloInput} /></Campo>
        <Campo rotulo="RIF"><input {...campo('rif')} className={estiloInput} /></Campo>
        <Campo rotulo="Nombre comercial"><input {...campo('nombre_comercial')} className={estiloInput} /></Campo>
        <Campo rotulo="Razón social"><input {...campo('razon_social')} className={estiloInput} /></Campo>
        <Campo rotulo="Zona (brick)"><input {...campo('brick')} className={estiloInput} /></Campo>
        <Campo rotulo="Cadena"><input {...campo('bandera')} className={estiloInput} /></Campo>
        <Campo rotulo="Municipio"><input {...campo('municipio')} className={estiloInput} /></Campo>
        <Campo rotulo="Estado"><input {...campo('estado_geografico')} className={estiloInput} /></Campo>
        <Campo rotulo="Dirección" className="sm:col-span-2"><input {...campo('direccion')} className={estiloInput} /></Campo>
        <Campo rotulo="Teléfono"><input {...campo('telefono')} inputMode="tel" className={estiloInput} /></Campo>
        <Campo rotulo="Frecuencia de visita">
          <select value={f.frecuencia_dias?.toString() ?? ''} onChange={(e) => setF({ ...f, frecuencia_dias: e.target.value ? Number(e.target.value) : null })} className={estiloInput}>
            {FRECUENCIAS.map((x) => <option key={x.v} value={x.v}>{x.t}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Latitud" ayuda="Opcional (GPS)"><input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" className={estiloInput} /></Campo>
        <Campo rotulo="Longitud" ayuda="Opcional (GPS)"><input value={lon} onChange={(e) => setLon(e.target.value)} inputMode="decimal" className={estiloInput} /></Campo>
        {error && <p role="alert" className="text-sm text-rose-700 sm:col-span-2">{error}</p>}
        <div className="flex flex-wrap justify-between gap-2 sm:col-span-2">
          {onEliminar ? <Boton variante="fantasma" className="!text-rose-700" onClick={onEliminar}>Eliminar</Boton> : <span />}
          <div className="flex gap-2">
            <Boton onClick={onCerrar}>Cancelar</Boton>
            <Boton type="submit" variante="primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
