import { useMemo, useState } from 'react';
import { Download, FileUp, MapPin, MapPinCheck, Pencil, Phone, Plus, Search, Stethoscope, Trash2 } from 'lucide-react';
import { Sheet } from '../components/capture/Sheet';
import { Medidor } from '../components/graficos/Graficos';
import { Avatar, Boton, BotonArchivo, Campo, Etiqueta, Filtros, PageHeader, Segmentado, Tarjeta, Vacio, estiloInput, useAviso, useConfirmar, useDebounced } from '../components/ui/kit';
import { normalizar } from '../offline/busqueda';
import { sincronizarYa } from '../offline/motor';
import type { LocalMedico } from '../offline/types';
import { ErrorArchivo, leerArchivoTabla } from '../services/leerHoja';
import { getSupabaseClient } from '../services/supabaseClient';
import type { Usuario } from '../types/pharmacy';
import { descargarTexto } from '../vistas/logica';
import { useClientes, useProductos, useUsuariosNube } from '../vistas/useDatos';
import { fechaCorta, leerUbicacion, useMedicos, useTareas, useVisitas } from './datos';
import { HistorialRegistro, ListaVisitas } from './Historial';
import { PLANTILLA_MEDICOS, coberturaMedicos, leerMedicos, resumenCobertura } from './medicos';
import type { CoberturaMedico } from './medicos';
import { TareasDe } from './Tareas';
import { usePeriodoDeEquipo } from '../ciclos/datos';
import { VisitaForm } from './VisitaForm';

type Filtro = 'todos' | 'pendientes' | 'A' | 'B' | 'C';
const POR_PAGINA = 60;
const enlace = 'inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800';

/**
 * Médicos: la cartera del visitador (el mismo representante visita médicos y toma pedidos). Cobertura del ciclo (cada
 * representante con el ciclo vigente de su equipo; sin ciclos, el mes), ficha con
 * visitas y tareas, alta y carga por archivo (la gerencia y la administración asignan cada médico a su representante).
 */
export function MedicosVista({ usuario }: { usuario: Usuario }) {
  const medicos = useMedicos();
  const visitas = useVisitas();
  const tareas = useTareas();
  const productos = useProductos();
  const clientes = useClientes();
  const { usuarios } = useUsuariosNube();
  const gestiona = usuario.rol === 'admin' || usuario.rol === 'gerente';
  const esVendedor = usuario.rol === 'vendedor';
  const [texto, setTexto] = useState('');
  const q = useDebounced(texto, 150);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [representante, setRepresentante] = useState('');
  const [limite, setLimite] = useState(POR_PAGINA);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [edicion, setEdicion] = useState<Partial<LocalMedico> | null>(null);
  const [visitando, setVisitando] = useState<LocalMedico | null>(null);
  const { mostrar, nodo } = useAviso();
  const { confirmar, nodo: nodoConfirmar } = useConfirmar();

  const vendedores = usuarios.filter((u) => u.rol === 'vendedor' && u.activo);
  const nombreUsuario = (id?: string | null) => (id ? usuarios.find((u) => u.id === id)?.nombre_completo ?? (id === usuario.id ? usuario.nombre_completo : 'Representante') : 'Sin representante');
  const deCartera = useMemo(() => (representante ? medicos.filter((m) => m.vendedor_id === representante) : medicos), [medicos, representante]);
  // Cada médico se mide con el ciclo vigente del equipo de su representante (o el general; sin ciclos, el mes).
  const periodoDeEquipo = usePeriodoDeEquipo();
  const periodoDe = useMemo(() => {
    const equipo = new Map(usuarios.map((u) => [u.id, u.equipo_id ?? null]));
    return (vendedorId?: string | null) => periodoDeEquipo(vendedorId === usuario.id ? usuario.equipo_id : vendedorId ? equipo.get(vendedorId) : null);
  }, [usuarios, usuario.id, usuario.equipo_id, periodoDeEquipo]);
  const cobertura = useMemo(() => coberturaMedicos(deCartera, visitas, (m) => periodoDe(m.vendedor_id)), [deCartera, visitas, periodoDe]);
  const resumen = resumenCobertura(cobertura);
  const periodos = [...new Map(deCartera.map((m) => periodoDe(m.vendedor_id)).map((p) => [p.etiqueta, p])).values()];
  const unPeriodo = periodos.length <= 1 ? (periodos[0] ?? periodoDe(usuario.id)) : null;
  const textoPeriodo = unPeriodo ? (unPeriodo.tipo === 'ciclo' ? `el ciclo ${unPeriodo.etiqueta}` : `el mes`) : 'el ciclo vigente de cada equipo';
  const lista = useMemo(() => {
    const palabras = normalizar(q).split(' ').filter(Boolean);
    return cobertura.filter((c) => {
      const m = c.medico;
      if (filtro === 'pendientes' && c.hechas >= c.esperadas) return false;
      if ((filtro === 'A' || filtro === 'B' || filtro === 'C') && m.categoria !== filtro) return false;
      const t = normalizar(`${m.nombre} ${m.especialidad ?? ''} ${m.centro ?? ''} ${m.ciudad ?? ''} ${m.zona ?? ''} ${m.codigo ?? ''}`);
      return palabras.every((p) => t.includes(p));
    });
  }, [cobertura, q, filtro]);
  const seleccionado = abierto ? cobertura.find((c) => c.medico.id === abierto) : undefined;

  const eliminar = async (m: LocalMedico) => {
    const sb = getSupabaseClient();
    if (!sb || !(await confirmar(`Eliminar a ${m.nombre}`, 'Deja de aparecer en la cartera. Sus visitas se conservan.', { accion: 'Eliminar', peligro: true }))) return;
    const { error } = await sb.rpc('eliminar_registros', { p_tipo: 'medicos', p_claves: [m.id] });
    if (error) return mostrar({ tipo: 'error', texto: error.message });
    setAbierto(null);
    await sincronizarYa();
    mostrar({ tipo: 'ok', texto: `${m.nombre} eliminado.` });
  };

  const cargar = async (archivo: File) => {
    const sb = getSupabaseClient();
    if (!sb) return;
    try {
      const tabla = await leerArchivoTabla(archivo);
      const leido = leerMedicos(tabla.filas);
      if (leido.filas.length === 0) return mostrar({ tipo: 'error', texto: leido.descartes[0]?.motivo ?? 'El archivo no trae médicos.' });
      if (!(await confirmar(`Cargar ${leido.filas.length} médicos`, `${archivo.name}: ${leido.filas.length} médicos para crear o actualizar (por código)${leido.descartes.length ? `; ${leido.descartes.length} filas sin nombre se omiten` : ''}.`, { accion: 'Cargar' }))) return;
      let ins = 0;
      let act = 0;
      const sinCuenta = new Set<string>();
      for (let i = 0; i < leido.filas.length; i += 500) {
        const { data, error } = await sb.rpc('cargar_medicos', { p_filas: leido.filas.slice(i, i + 500).map(({ linea: _l, ...f }) => f) });
        if (error) throw new Error(error.message);
        const r = data as { insertados: number; actualizados: number; correos_sin_cuenta: string[] };
        ins += r.insertados;
        act += r.actualizados;
        r.correos_sin_cuenta.forEach((c) => sinCuenta.add(c));
      }
      await sincronizarYa();
      mostrar({ tipo: 'ok', texto: `${ins} médicos nuevos y ${act} actualizados.${sinCuenta.size ? ` Sin cuenta en NOVA (quedaron sin representante): ${[...sinCuenta].slice(0, 5).join(', ')}.` : ''}` });
    } catch (e) {
      mostrar({ tipo: 'error', texto: e instanceof ErrorArchivo ? e.message : `No se pudo cargar: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  return (
    <div>
      <PageHeader
        titulo={esVendedor ? 'Mis médicos' : 'Médicos'}
        descripcion={esVendedor ? `Tu cartera de médicos y cómo vas con las visitas en ${textoPeriodo}.` : `Cartera de médicos por representante, con la cobertura de visitas en ${textoPeriodo}.`}
        acciones={
          <>
            {gestiona && <BotonArchivo icono={FileUp} accept=".xlsx,.csv,.txt,text/csv" onArchivo={(f) => void cargar(f)}>Cargar archivo</BotonArchivo>}
            {(gestiona || esVendedor) && <Boton variante="primario" icono={Plus} onClick={() => setEdicion({ vendedor_id: esVendedor ? usuario.id : null, activo: true })}>Nuevo médico</Boton>}
          </>
        }
      />
      {nodo}
      {nodoConfirmar}

      <div className="mb-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Tarjeta>
          <Medidor valor={resumen.visitas} total={resumen.esperadas} rotulo={unPeriodo ? `Visitas ${unPeriodo.del}${unPeriodo.tipo === 'ciclo' ? ` ${unPeriodo.ciclo?.nombre ?? ''}` : ''}` : 'Visitas del ciclo de cada equipo'} nota={`${resumen.cubiertos} de ${resumen.total} médicos con todas sus visitas · cuentan las visitas "realizadas"${unPeriodo?.tipo === 'ciclo' ? ` · quedan ${unPeriodo.restantes} días hábiles` : ''}`} />
        </Tarjeta>
        {gestiona && (
          <Tarjeta className="flex flex-col justify-center gap-2">
            <p className="text-xs text-slate-500">Para cargar muchos a la vez usa un Excel o CSV con una fila por médico. La columna REPRESENTANTE lleva el correo de su cuenta en NOVA.</p>
            <div><Boton tamano="sm" icono={Download} onClick={() => descargarTexto('plantilla_medicos.csv', `﻿${PLANTILLA_MEDICOS}`)}>Descargar plantilla</Boton></div>
          </Tarjeta>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input value={texto} onChange={(e) => { setTexto(e.target.value); setLimite(POR_PAGINA); }} placeholder="Buscar por nombre, especialidad, centro o zona" aria-label="Buscar médico" className={`${estiloInput} pl-9`} />
        </div>
        {!esVendedor && vendedores.length > 0 && (
          <select value={representante} onChange={(e) => setRepresentante(e.target.value)} aria-label="Representante" className={`${estiloInput} w-auto`}>
            <option value="">Todos los representantes</option>
            {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre_completo}</option>)}
          </select>
        )}
      </div>
      <div className="mb-3">
        <Filtros valor={filtro} onChange={setFiltro} opciones={[{ id: 'todos', texto: 'Todos' }, { id: 'pendientes', texto: `Por visitar (${cobertura.filter((c) => c.hechas < c.esperadas).length})` }, { id: 'A', texto: 'Categoría A' }, { id: 'B', texto: 'Categoría B' }, { id: 'C', texto: 'Categoría C' }]} />
      </div>

      <Tarjeta className="!p-0">
        {lista.length === 0 ? (
          <Vacio
            icono={Stethoscope}
            titulo={medicos.length === 0 ? (esVendedor ? 'Aún no tienes médicos en tu cartera' : 'Todavía no hay médicos') : 'Sin resultados'}
            texto={medicos.length === 0 ? (gestiona ? 'Cárgalos con un archivo o agrégalos uno por uno.' : 'Agrega los médicos que visitas con "Nuevo médico".') : 'Prueba con otra búsqueda o quita los filtros.'}
          />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {lista.slice(0, limite).map((c) => <FilaMedico key={c.medico.id} c={c} este={periodoDe(c.medico.vendedor_id).tipo === 'ciclo' ? 'este ciclo' : 'este mes'} representante={esVendedor ? undefined : nombreUsuario(c.medico.vendedor_id)} onAbrir={() => setAbierto(c.medico.id)} />)}
          </ul>
        )}
        {lista.length > limite && (
          <div className="border-t border-slate-100 p-2 text-center dark:border-slate-800">
            <Boton variante="suave" onClick={() => setLimite((l) => l + POR_PAGINA)}>Ver más ({lista.length - limite})</Boton>
          </div>
        )}
      </Tarjeta>

      <Sheet abierto={!!seleccionado} titulo={seleccionado?.medico.nombre ?? ''} onCerrar={() => setAbierto(null)} ancho="md:max-w-xl">
        {seleccionado && (
          <FichaMedico
            c={seleccionado}
            este={periodoDe(seleccionado.medico.vendedor_id).tipo === 'ciclo' ? 'este ciclo' : 'este mes'}
            representante={nombreUsuario(seleccionado.medico.vendedor_id)}
            visitas={visitas.filter((v) => v.medico_id === seleccionado.medico.id)}
            tareas={tareas.filter((t) => t.medico_id === seleccionado.medico.id)}
            productos={productos}
            clientes={clientes}
            medicos={medicos}
            vendedorId={usuario.id}
            verHistorial={gestiona}
            nombreUsuario={(id) => nombreUsuario(id)}
            onVisita={esVendedor || usuario.rol === 'admin' ? () => setVisitando(seleccionado.medico) : undefined}
            onEditar={gestiona || seleccionado.medico.vendedor_id === usuario.id ? () => setEdicion(seleccionado.medico) : undefined}
            onEliminar={usuario.rol === 'admin' ? () => void eliminar(seleccionado.medico) : undefined}
          />
        )}
      </Sheet>

      {edicion && (
        <MedicoForm
          inicial={edicion}
          vendedores={gestiona ? vendedores.map((v) => ({ id: v.id, nombre: v.nombre_completo })) : undefined}
          onCerrar={() => setEdicion(null)}
          onGuardado={async (nombre) => { setEdicion(null); await sincronizarYa(); mostrar({ tipo: 'ok', texto: `${nombre} guardado.` }); }}
        />
      )}
      {visitando && (
        <VisitaForm
          destino={{ tipo: 'medico', medico: visitando }}
          vendedorId={usuario.id}
          productos={productos}
          onCerrar={() => setVisitando(null)}
          onGuardada={({ tarea, conGps }) => { setVisitando(null); mostrar({ tipo: 'ok', texto: `Visita a ${visitando.nombre} registrada${conGps ? '' : ' (sin ubicación)'}.${tarea ? ' La próxima acción quedó en tus tareas.' : ''}` }); }}
        />
      )}
    </div>
  );
}

function FilaMedico({ c, este, representante, onAbrir }: { c: CoberturaMedico; este: string; representante?: string; onAbrir: () => void }) {
  const m = c.medico;
  const listo = c.hechas >= c.esperadas;
  return (
    <li>
      <button type="button" onClick={onAbrir} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
        <Avatar nombre={m.nombre} tamano={38} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{m.nombre}</p>
          <p className="truncate text-xs text-slate-500">{[m.especialidad, m.centro, m.zona ?? m.ciudad, representante].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {m.categoria && <Etiqueta tono={m.categoria === 'A' ? 'marca' : 'neutro'}>Cat. {m.categoria}</Etiqueta>}
          <span className={`text-xs ${listo ? 'text-emerald-700 dark:text-emerald-300' : 'font-semibold text-slate-600 dark:text-slate-300'}`}>{c.hechas} de {c.esperadas} {este}</span>
        </div>
      </button>
    </li>
  );
}

type Pestana = 'resumen' | 'visitas' | 'tareas' | 'historial';

function FichaMedico({ c, este, representante, visitas, tareas, productos, clientes, medicos, vendedorId, verHistorial, nombreUsuario, onVisita, onEditar, onEliminar }: {
  c: CoberturaMedico;
  este: string;
  representante: string;
  visitas: Parameters<typeof ListaVisitas>[0]['visitas'];
  tareas: Parameters<typeof TareasDe>[0]['tareas'];
  productos: Parameters<typeof ListaVisitas>[0]['productos'];
  clientes: Parameters<typeof TareasDe>[0]['clientes'];
  medicos: LocalMedico[];
  vendedorId: string;
  verHistorial: boolean;
  nombreUsuario: (id: string) => string;
  onVisita?: () => void;
  onEditar?: () => void;
  onEliminar?: () => void;
}) {
  const [pestana, setPestana] = useState<Pestana>('resumen');
  const m = c.medico;
  const muestras = visitas.reduce((a, v) => a + (v.muestras ?? []).reduce((b, x) => b + x.cantidad, 0), 0);
  const mapa = m.lat != null && m.lon != null ? `https://www.google.com/maps/search/?api=1&query=${m.lat},${m.lon}` : null;
  const pendientes = tareas.filter((t) => t.estado === 'pendiente').length;
  const hoy = new Date();
  const hoyTexto = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-2">
        {onVisita && <Boton variante="primario" icono={MapPinCheck} onClick={onVisita}>Registrar visita</Boton>}
        {m.telefono && <a href={`tel:${m.telefono}`} className={enlace}><Phone className="h-4 w-4" aria-hidden />{m.telefono}</a>}
        {mapa && <a href={mapa} target="_blank" rel="noopener noreferrer" className={enlace}><MapPin className="h-4 w-4" aria-hidden />Cómo llegar</a>}
        {onEditar && <Boton icono={Pencil} onClick={onEditar}>Editar</Boton>}
        {onEliminar && <Boton variante="fantasma" icono={Trash2} onClick={onEliminar}>Eliminar</Boton>}
      </div>
      <Segmentado
        valor={pestana}
        onChange={setPestana}
        opciones={[
          { id: 'resumen', texto: 'Resumen' },
          { id: 'visitas', texto: 'Visitas', cuenta: visitas.length || undefined },
          { id: 'tareas', texto: 'Tareas', cuenta: pendientes || undefined },
          ...(verHistorial ? [{ id: 'historial' as const, texto: 'Historial' }] : []),
        ]}
      />
      {pestana === 'resumen' && (
        <div className="space-y-4">
          <Medidor valor={c.hechas} total={c.esperadas} rotulo={`Visitas de ${este}`} nota={c.ultima ? `Última visita: ${fechaCorta(c.ultima)}` : 'Aún sin visitas registradas'} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {[
              ['Especialidad', m.especialidad], ['Categoría', m.categoria ? `Categoría ${m.categoria}` : null], ['Centro', m.centro], ['Dirección', m.direccion],
              ['Ciudad', m.ciudad], ['Zona', m.zona], ['Correo', m.correo], ['Código', m.codigo], ['Representante', representante],
              ['Muestras entregadas (90 días)', muestras ? String(muestras) : null], ['Nota', m.notas],
            ].filter(([, v]) => v).map(([k, v]) => (
              <div key={k as string} className="min-w-0">
                <dt className="text-slate-500">{k}</dt>
                <dd className="truncate font-semibold" title={v as string}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {pestana === 'visitas' && <ListaVisitas visitas={visitas} productos={productos} nombreVendedor={nombreUsuario} />}
      {pestana === 'tareas' && <TareasDe tareas={tareas} hoy={hoyTexto} vendedorId={vendedorId} destino={{ medico_id: m.id, nombre: m.nombre }} clientes={clientes} medicos={medicos} />}
      {pestana === 'historial' && verHistorial && <HistorialRegistro tabla="dim_medicos" registroId={m.id} nombreUsuario={nombreUsuario} />}
    </div>
  );
}

function MedicoForm({ inicial, vendedores, onCerrar, onGuardado }: {
  inicial: Partial<LocalMedico>;
  /** Solo la gerencia y la administración eligen el representante. */
  vendedores?: { id: string; nombre: string }[];
  onCerrar: () => void;
  onGuardado: (nombre: string) => void;
}) {
  const [m, setM] = useState<Partial<LocalMedico>>(inicial);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [ubicando, setUbicando] = useState(false);
  const campo = (k: keyof LocalMedico) => ({ value: (m[k] as string | number | null | undefined) ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setM({ ...m, [k]: e.target.value }) });

  const ubicar = async () => {
    setUbicando(true);
    const pos = await leerUbicacion();
    setUbicando(false);
    if (!pos) return setError('No se pudo leer tu ubicación. Activa el GPS.');
    setM({ ...m, lat: Number(pos.coords.latitude.toFixed(6)), lon: Number(pos.coords.longitude.toFixed(6)) });
  };

  const guardar = async () => {
    const sb = getSupabaseClient();
    if (!sb) return;
    if (!m.nombre?.trim()) return setError('Escribe el nombre del médico.');
    setGuardando(true);
    setError('');
    const fila = {
      ...(m.id ? { id: m.id } : {}),
      nombre: m.nombre.trim(), especialidad: m.especialidad || null, centro: m.centro || null, direccion: m.direccion || null, ciudad: m.ciudad || null,
      zona: m.zona || null, telefono: m.telefono || null, correo: m.correo || null, categoria: m.categoria || null,
      visitas_mes: m.visitas_mes === undefined || m.visitas_mes === null || String(m.visitas_mes) === '' ? null : Number(m.visitas_mes),
      lat: m.lat ?? null, lon: m.lon ?? null, vendedor_id: m.vendedor_id || null, notas: m.notas || null, activo: true,
    };
    const { error: err } = m.id ? await sb.from('dim_medicos').update(fila).eq('id', m.id) : await sb.from('dim_medicos').insert(fila);
    setGuardando(false);
    if (err) return setError(/codigo/.test(err.message) ? 'Ya existe un médico con ese código.' : err.message);
    onGuardado(fila.nombre);
  };

  return (
    <Sheet abierto titulo={m.id ? 'Editar médico' : 'Nuevo médico'} onCerrar={onCerrar}>
      <div className="flex flex-col gap-3">
        <Campo rotulo="Nombre y apellido"><input {...campo('nombre')} className={estiloInput} autoFocus /></Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Especialidad"><input {...campo('especialidad')} placeholder="Ej.: Cardiología" className={estiloInput} /></Campo>
          <Campo rotulo="Centro, clínica o consultorio"><input {...campo('centro')} className={estiloInput} /></Campo>
          <Campo rotulo="Teléfono"><input {...campo('telefono')} inputMode="tel" className={estiloInput} /></Campo>
          <Campo rotulo="Correo"><input {...campo('correo')} inputMode="email" className={estiloInput} /></Campo>
          <Campo rotulo="Ciudad"><input {...campo('ciudad')} className={estiloInput} /></Campo>
          <Campo rotulo="Zona"><input {...campo('zona')} className={estiloInput} /></Campo>
          <Campo rotulo="Categoría" ayuda="A = mayor potencial de prescripción.">
            <select {...campo('categoria')} className={estiloInput}>
              <option value="">Sin categoría</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </Campo>
          <Campo rotulo="Visitas por ciclo" ayuda="Sin ciclos, por mes"><input {...campo('visitas_mes')} inputMode="numeric" placeholder="1" className={estiloInput} /></Campo>
        </div>
        <Campo rotulo="Dirección"><input {...campo('direccion')} className={estiloInput} /></Campo>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <Boton tamano="sm" icono={MapPin} disabled={ubicando} onClick={() => void ubicar()}>{ubicando ? 'Buscando…' : 'Usar mi ubicación (estoy en el consultorio)'}</Boton>
          {m.lat != null && m.lon != null && <span>{m.lat}, {m.lon}</span>}
        </div>
        {vendedores && (
          <Campo rotulo="Representante">
            <select {...campo('vendedor_id')} className={estiloInput}>
              <option value="">Sin representante</option>
              {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>
          </Campo>
        )}
        <Campo rotulo="Nota"><textarea {...campo('notas')} rows={2} className={estiloInput} /></Campo>
        {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="primario" disabled={guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar médico'}</Boton>
        </div>
      </div>
    </Sheet>
  );
}
