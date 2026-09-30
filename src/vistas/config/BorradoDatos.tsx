import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { getSupabaseClient } from '../../services/supabaseClient';
import { obtenerDb } from '../../offline/db';
import { limpiarDatosLocales } from '../../offline/aislamiento';
import { borrarClavesLocales } from '../../hooks/usePersistentState';
import { Boton, Tarjeta, estiloInput, useAviso } from '../../components/ui/kit';

type Alcance = 'historial' | 'pedidos' | 'todo';
const ALCANCES: { id: Alcance; titulo: string; texto: string }[] = [
  { id: 'historial', titulo: 'Historial de ventas', texto: 'Las ventas que reportaron las droguerías y el consolidado mensual. Farmacias, productos y pedidos se conservan.' },
  { id: 'pedidos', titulo: 'Pedidos', texto: 'Todos los pedidos, visitas, plantillas y avisos. La numeración vuelve a empezar en PED-1001.' },
  { id: 'todo', titulo: 'Todo', texto: 'Historial, pedidos y también farmacias, productos, droguerías, homologaciones, ficheros y reglas. Solo se conservan los usuarios.' },
];

/**
 * Borrado de datos de la nube (solo administrador). Tres candados: rol de administrador, interruptor "permitir borrado"
 * y una clave propia (distinta de la de inicio de sesión). Cada uso queda registrado.
 */
export function BorradoDatos() {
  const sb = getSupabaseClient();
  const [estado, setEstado] = useState<{ clave_definida: boolean; habilitado: boolean } | null>(null);
  const [nuevaClave, setNuevaClave] = useState('');
  const [alcance, setAlcance] = useState<Alcance>('historial');
  const [clave, setClave] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const { mostrar, nodo } = useAviso();

  const cargar = useCallback(async () => {
    if (!sb) return;
    const { data, error } = await sb.rpc('estado_borrado');
    if (error) mostrar({ tipo: 'error', texto: error.message });
    else setEstado(data as { clave_definida: boolean; habilitado: boolean });
  }, [sb, mostrar]);
  useEffect(() => { void cargar(); }, [cargar]);

  if (!sb) return <Tarjeta><p className="text-sm text-slate-500">El borrado de la nube solo está disponible con Supabase conectado. Para vaciar los datos de demostración usa "Borrar datos de este dispositivo" en Sincronización.</p></Tarjeta>;

  const rpc = async (fn: string, args: Record<string, unknown>, ok: string) => {
    setOcupado(true);
    const { error } = await sb.rpc(fn, args);
    setOcupado(false);
    if (error) return mostrar({ tipo: 'error', texto: error.message });
    mostrar({ tipo: 'ok', texto: ok });
    void cargar();
  };

  const borrar = async () => {
    if (confirmacion.trim().toUpperCase() !== 'BORRAR') return mostrar({ tipo: 'error', texto: 'Escribe BORRAR para confirmar.' });
    setOcupado(true);
    const { data, error } = await sb.rpc('borrar_datos', { p_clave: clave, p_alcance: alcance });
    setOcupado(false);
    if (error) return mostrar({ tipo: 'error', texto: error.message });
    const r = data as { ok: boolean; error?: string };
    if (!r.ok) return mostrar({ tipo: 'error', texto: r.error === 'demasiados_intentos' ? 'Demasiados intentos fallidos. Espera 15 minutos.' : 'La clave de borrado no es correcta.' });
    // Se apaga el interruptor y se vacía también lo guardado en este dispositivo.
    await sb.rpc('habilitar_borrado', { p_habilitar: false });
    await limpiarDatosLocales(obtenerDb());
    await borrarClavesLocales();
    mostrar({ tipo: 'ok', texto: 'Datos borrados. Se recargará la aplicación…' });
    setTimeout(() => window.location.reload(), 1500);
  };

  return (
    <div className="space-y-3">
      {nodo}
      <Tarjeta className="border-rose-200 dark:border-rose-900">
        <p className="mb-2 flex items-center gap-2 text-sm font-bold text-rose-700 dark:text-rose-400"><ShieldAlert className="h-4 w-4" /> Borrar datos de la nube</p>
        <p className="mb-3 text-xs text-slate-500">No se puede deshacer. Úsalo para vaciar datos de prueba antes de cargar los reales.</p>

        {/* 1. clave */}
        <div className="mb-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
          <p className="mb-1 text-xs font-bold">1. Clave de borrado {estado?.clave_definida ? '(definida ✓)' : '(sin definir)'}</p>
          <div className="flex flex-wrap gap-2">
            <input type="password" autoComplete="new-password" value={nuevaClave} onChange={(e) => setNuevaClave(e.target.value)} placeholder={estado?.clave_definida ? 'Nueva clave (para cambiarla)' : 'Crea una clave (mínimo 6 caracteres)'} aria-label="Clave de borrado" className={`${estiloInput} flex-1`} />
            <Boton disabled={ocupado || nuevaClave.length < 6} onClick={() => void rpc('configurar_password_purga', { p_nueva: nuevaClave }, 'Clave de borrado guardada.').then(() => setNuevaClave(''))}>Guardar clave</Boton>
          </div>
        </div>

        {/* 2. interruptor */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
          <p className="text-xs"><b>2. Permitir borrado:</b> {estado?.habilitado ? 'ACTIVADO' : 'apagado'}. Se apaga solo después de borrar.</p>
          <Boton variante={estado?.habilitado ? 'secundario' : 'peligro'} disabled={ocupado || !estado} onClick={() => void rpc('habilitar_borrado', { p_habilitar: !estado?.habilitado }, estado?.habilitado ? 'Borrado desactivado.' : 'Borrado activado: ya puedes usarlo.')}>{estado?.habilitado ? 'Desactivar' : 'Activar'}</Boton>
        </div>

        {/* 3. borrar */}
        {estado?.habilitado && estado.clave_definida && (
          <div className="space-y-2 rounded-xl border border-rose-200 p-3 dark:border-rose-900">
            <p className="text-xs font-bold">3. ¿Qué borrar?</p>
            <div className="space-y-1.5">
              {ALCANCES.map((a) => (
                <label key={a.id} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-2.5 text-xs ${alcance === a.id ? 'border-rose-400 bg-rose-50 dark:border-rose-700 dark:bg-rose-950/30' : 'border-slate-200 dark:border-slate-800'}`}>
                  <input type="radio" name="alcance" checked={alcance === a.id} onChange={() => setAlcance(a.id)} className="mt-0.5 accent-rose-600" />
                  <span><b>{a.titulo}</b><br />{a.texto}</span>
                </label>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input type="password" autoComplete="off" value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Tu clave de borrado" aria-label="Clave para borrar" className={estiloInput} />
              <input value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} placeholder='Escribe BORRAR' aria-label="Confirmación" className={estiloInput} />
            </div>
            <Boton variante="peligro" disabled={ocupado || !clave || confirmacion.trim().toUpperCase() !== 'BORRAR'} onClick={() => void borrar()}>{ocupado ? 'Borrando…' : `Borrar ${ALCANCES.find((a) => a.id === alcance)?.titulo.toLowerCase()}`}</Boton>
          </div>
        )}
      </Tarjeta>
    </div>
  );
}
