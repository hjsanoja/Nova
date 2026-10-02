import { useMemo, useState } from 'react';
import { Search, Trash2, UserPlus } from 'lucide-react';
import type { RolUsuario, Usuario } from '../../types/pharmacy';
import { getSupabaseClient, crearClienteSinSesion } from '../../services/supabaseClient';
import { crearUsuarioNube, rolDesdeV3 } from '../../services/nubeV3';
import { Avatar, BarraSeleccion, Boton, Campo, Casilla, Etiqueta, Tarjeta, Vacio, estiloInput, useAviso, useConfirmar, useSeleccion } from '../../components/ui/kit';
import { Sheet } from '../../components/capture/Sheet';
import { eliminarUsuarios, filtrarPorTexto } from '../../services/maestros';
import { useUsuariosNube } from '../useDatos';
import type { UsuarioNube } from '../useDatos';
import { ESTADOS_VENEZUELA } from '../../ciclos/logica';

const ROLES: { id: string; texto: string }[] = [
  { id: 'vendedor', texto: 'Vendedor' },
  { id: 'transferencista', texto: 'Transferencista' },
  { id: 'gerente', texto: 'Gerente' },
  { id: 'admin', texto: 'Administrador' },
];

interface Borrador { rol: string; equipo: string; activo: boolean }

/**
 * Personas con acceso. Cada vendedor tiene su propio usuario; los gerentes, transferencistas y administradores también.
 * El "equipo" (La Sante, OTC…) solo agrupa a los vendedores; las farmacias de cada uno se asignan en Datos > Fichero.
 */
export function Usuarios({ yo, onFichero }: { yo: Usuario; onFichero: () => void }) {
  const [recarga, setRecarga] = useState(0);
  const { usuarios, cargando, error } = useUsuariosNube(recarga);
  const [borradores, setBorradores] = useState<Record<string, Borrador>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const { mostrar, nodo } = useAviso();
  const { confirmar, nodo: nodoConfirmar } = useConfirmar();
  const sel = useSeleccion();
  const [texto, setTexto] = useState('');
  const [zona, setZona] = useState<UsuarioNube | null>(null);
  const equipos = useMemo(() => Array.from(new Set(usuarios.map((u) => u.equipo).filter((e): e is string => !!e))).sort(), [usuarios]);

  const actual = (u: UsuarioNube): Borrador => borradores[u.id] ?? { rol: u.rol, equipo: u.equipo ?? '', activo: u.activo };
  const sucio = (u: UsuarioNube) => {
    const b = borradores[u.id];
    return !!b && (b.rol !== u.rol || b.equipo !== (u.equipo ?? '') || b.activo !== u.activo);
  };
  const cambiar = (u: UsuarioNube, parche: Partial<Borrador>) => setBorradores((b) => ({ ...b, [u.id]: { ...actual(u), ...parche } }));

  const guardar = async (u: UsuarioNube) => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const b = actual(u);
    setGuardando(u.id);
    const { error: e } = await sb.rpc('admin_configurar_usuario', { p_usuario: u.id, p_rol: b.rol, p_equipo_codigo: b.equipo.trim() || null, p_activo: b.activo, p_nombre: null, p_telefono: null });
    setGuardando(null);
    if (e) return mostrar({ tipo: 'error', texto: e.message });
    setBorradores((x) => { const { [u.id]: _omit, ...resto } = x; return resto; });
    setRecarga((n) => n + 1);
    mostrar({ tipo: 'ok', texto: `${u.nombre_completo}: cambios guardados.` });
  };

  const porActivar = usuarios.filter((u) => !u.activo);
  const visibles = filtrarPorTexto([...porActivar, ...usuarios.filter((u) => u.activo)], texto, (u) => [u.nombre_completo, u.email, u.rol, u.equipo]);
  const seleccionables = visibles.filter((u) => u.id !== yo.id).map((u) => u.id);

  const eliminar = async () => {
    const sb = getSupabaseClient();
    if (!sb || sel.cantidad === 0) return;
    const ok = await confirmar(`Eliminar ${sel.cantidad} usuario${sel.cantidad === 1 ? '' : 's'}`, 'No podrán entrar ni ver datos, y sus farmacias salen de su fichero. Sus pedidos se conservan. Para borrar también la cuenta de acceso, hazlo en Supabase → Authentication → Users.', { accion: 'Eliminar', peligro: true });
    if (!ok) return;
    try {
      const n = await eliminarUsuarios(sb, [...sel.ids]);
      sel.limpiar();
      setRecarga((x) => x + 1);
      mostrar({ tipo: 'ok', texto: `${n} usuario${n === 1 ? '' : 's'} eliminado${n === 1 ? '' : 's'}.` });
    } catch (e: unknown) {
      mostrar({ tipo: 'error', texto: e instanceof Error ? e.message : String(e) });
    }
  };

  if (!getSupabaseClient()) return <Vacio titulo="Los usuarios se administran en la nube" texto="Conecta Supabase para crear cuentas y asignar roles." />;

  return (
    <div className="space-y-3">
      {nodo}
      {nodoConfirmar}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-xs text-slate-500">Cada persona entra con su correo. <b>Vendedor</b>: ve solo su fichero de farmacias. <b>Transferencista</b>: procesa pedidos y ve todas las farmacias. <b>Gerente</b>: consulta y reportes. <b>Administrador</b>: todo.</p>
        <Boton variante="primario" icono={UserPlus} onClick={() => setNuevo((v) => !v)}>Nuevo usuario</Boton>
      </div>

      {nuevo && <NuevoUsuario equipos={equipos} onCreado={(n) => { setNuevo(false); setRecarga((x) => x + 1); mostrar({ tipo: 'ok', texto: `Cuenta creada para ${n}.` }); }} onError={(t) => mostrar({ tipo: 'error', texto: t })} />}

      {porActivar.length > 0 && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {porActivar.length} cuenta{porActivar.length === 1 ? '' : 's'} esperando activación: asígnales rol y marca "Activo".
        </p>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre, correo, rol o equipo" aria-label="Buscar usuario" className={`${estiloInput} pl-9`} />
      </div>

      <BarraSeleccion cantidad={sel.cantidad} onLimpiar={sel.limpiar}>
        <Boton tamano="sm" variante="peligro" icono={Trash2} onClick={() => void eliminar()}>Eliminar {sel.cantidad}</Boton>
      </BarraSeleccion>

      <Tarjeta className="!p-0">
        {cargando ? <Vacio titulo="Cargando…" /> : error ? <Vacio titulo="No se pudo cargar" texto={error} /> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            <li className="flex items-center gap-1 bg-slate-50 px-1 text-xs font-medium text-slate-500 dark:bg-slate-950">
              <Casilla
                etiqueta="Seleccionar todos"
                marcada={seleccionables.length > 0 && seleccionables.every((id) => sel.tiene(id))}
                parcial={seleccionables.some((id) => sel.tiene(id)) && !seleccionables.every((id) => sel.tiene(id))}
                onChange={(v) => sel.fijarTodos(seleccionables, v)}
              />
              {visibles.length} persona{visibles.length === 1 ? '' : 's'}
            </li>
            {visibles.map((u) => {
              const b = actual(u);
              const soyYo = u.id === yo.id;
              return (
                <li key={u.id} className={`grid gap-2 py-2.5 pl-1 pr-3 md:grid-cols-[auto_1fr_auto_auto_auto_auto] md:items-center ${sel.tiene(u.id) ? 'bg-marca-50 dark:bg-marca-950/60' : ''}`}>
                  <div className="flex items-center gap-2 md:contents">
                    {soyYo ? <span className="w-10" /> : <Casilla etiqueta={`Seleccionar ${u.nombre_completo}`} marcada={sel.tiene(u.id)} onChange={() => sel.alternar(u.id)} />}
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar nombre={u.nombre_completo} foto={u.foto_url} tamano={36} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{u.nombre_completo}{soyYo && <span className="ml-1 text-xs font-normal text-slate-400">(tú)</span>}</p>
                        <p className="truncate text-xs text-slate-500">{u.email}</p>
                        <button type="button" onClick={() => setZona(u)} className="truncate text-xs font-medium text-marca-700 hover:underline dark:text-marca-300">
                          {[u.region, u.estado_geografico, u.ciudad].filter(Boolean).join(' · ') || 'Asignar zona'}
                        </button>
                      </div>
                    </div>
                  </div>
                  <select value={b.rol} disabled={soyYo} onChange={(e) => cambiar(u, { rol: e.target.value })} aria-label={`Rol de ${u.nombre_completo}`} className={`${estiloInput} md:w-40`}>
                    {ROLES.map((r) => <option key={r.id} value={r.id}>{r.texto}</option>)}
                  </select>
                  <input value={b.equipo} onChange={(e) => cambiar(u, { equipo: e.target.value })} list="equipos" placeholder="Equipo (opcional)" aria-label={`Equipo de ${u.nombre_completo}`} className={`${estiloInput} md:w-36`} />
                  <label className="flex min-h-10 items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" checked={b.activo} disabled={soyYo} onChange={(e) => cambiar(u, { activo: e.target.checked })} className="h-4 w-4 accent-marca-600" /> Activo
                  </label>
                  <div className="flex items-center gap-2">
                    {sucio(u) ? <Boton variante="primario" disabled={guardando === u.id} onClick={() => void guardar(u)}>Guardar</Boton> : u.rol === 'vendedor' && u.activo ? <Boton variante="suave" onClick={onFichero}>Fichero</Boton> : <Etiqueta tono={u.activo ? 'verde' : 'ambar'}>{u.activo ? 'Al día' : 'Inactivo'}</Etiqueta>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <datalist id="equipos">{equipos.map((e) => <option key={e} value={e} />)}</datalist>
      </Tarjeta>
      {zona && <ZonaUsuario usuario={zona} onCerrar={() => setZona(null)} onGuardado={() => { setZona(null); setRecarga((x) => x + 1); mostrar({ tipo: 'ok', texto: 'Zona guardada.' }); }} />}
    </div>
  );
}

/** Estado, ciudad y región de la persona: sirven para dirigirle comunicados por zona. */
function ZonaUsuario({ usuario: u, onCerrar, onGuardado }: { usuario: UsuarioNube; onCerrar: () => void; onGuardado: () => void }) {
  const [z, setZ] = useState({ region: u.region ?? '', estado_geografico: u.estado_geografico ?? '', ciudad: u.ciudad ?? '' });
  const [error, setError] = useState('');
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabaseClient();
    if (!sb) return;
    const limpio = (t: string) => t.trim() || null;
    const { error: err } = await sb.from('dim_usuarios').update({ region: limpio(z.region), estado_geografico: limpio(z.estado_geografico), ciudad: limpio(z.ciudad) }).eq('id', u.id);
    if (err) return setError(err.message);
    onGuardado();
  };
  return (
    <Sheet abierto titulo={`Zona de ${u.nombre_completo}`} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="flex flex-col gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">Se usa para enviarle comunicados por región, estado o ciudad. A un vendedor también le llegan los de las zonas de las farmacias de su fichero. El estado también decide qué feriados regionales no cuenta como días hábiles.</p>
        <Campo rotulo="Región"><input value={z.region} onChange={(e) => setZ({ ...z, region: e.target.value })} placeholder="Ej.: Occidente" className={estiloInput} /></Campo>
        <Campo rotulo="Estado"><input value={z.estado_geografico} onChange={(e) => setZ({ ...z, estado_geografico: e.target.value })} list="estados-zona" placeholder="Ej.: Zulia" className={estiloInput} /></Campo>
        <datalist id="estados-zona">{ESTADOS_VENEZUELA.map((e) => <option key={e} value={e} />)}</datalist>
        <Campo rotulo="Ciudad"><input value={z.ciudad} onChange={(e) => setZ({ ...z, ciudad: e.target.value })} placeholder="Ej.: Maracaibo" className={estiloInput} /></Campo>
        {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton type="submit" variante="primario">Guardar</Boton>
        </div>
      </form>
    </Sheet>
  );
}

function NuevoUsuario({ equipos, onCreado, onError }: { equipos: string[]; onCreado: (nombre: string) => void; onError: (t: string) => void }) {
  const [f, setF] = useState({ nombre: '', email: '', password: '', rol: 'vendedor', equipo: '' });
  const [enviando, setEnviando] = useState(false);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    const admin = getSupabaseClient();
    const registro = crearClienteSinSesion();
    if (!admin || !registro) return;
    if (f.password.length < 6) return onError('La contraseña temporal debe tener al menos 6 caracteres.');
    setEnviando(true);
    try {
      await crearUsuarioNube(admin, registro, {
        email: f.email.trim(),
        password: f.password,
        nombre_completo: f.nombre.trim(),
        rol: rolDesdeV3(f.rol) as RolUsuario,
        equipo: f.equipo,
        activo: true,
      });
      onCreado(f.nombre.trim());
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Tarjeta>
      <form onSubmit={crear} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <input required placeholder="Nombre completo" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className={estiloInput} aria-label="Nombre completo" />
        <input required type="email" placeholder="Correo" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={estiloInput} aria-label="Correo" />
        <input required type="text" placeholder="Contraseña temporal" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className={estiloInput} aria-label="Contraseña temporal" autoComplete="off" />
        <select value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value })} className={estiloInput} aria-label="Rol">{ROLES.map((r) => <option key={r.id} value={r.id}>{r.texto}</option>)}</select>
        <input list="equipos-nuevo" placeholder="Equipo (opcional)" value={f.equipo} onChange={(e) => setF({ ...f, equipo: e.target.value })} className={estiloInput} aria-label="Equipo" />
        <datalist id="equipos-nuevo">{equipos.map((e) => <option key={e} value={e} />)}</datalist>
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-5">
          <Boton type="submit" variante="primario" disabled={enviando}>{enviando ? 'Creando…' : 'Crear cuenta'}</Boton>
          <p className="text-xs text-slate-500">La persona podrá cambiar su contraseña en Configuración → Mi cuenta.</p>
        </div>
      </form>
    </Tarjeta>
  );
}
