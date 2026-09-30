import { useEffect, useState } from 'react';
import { Bell, BellOff, Copy, KeyRound } from 'lucide-react';
import { Boton, Campo, Etiqueta, Tarjeta, estiloInput, useAviso } from '../components/ui/kit';
import { getStoredSupabaseConfig, getSupabaseClient } from '../services/supabaseClient';
import { activarAvisos, desactivarAvisos, generarClavesAvisos, mostrarAviso, permisoAvisos, suscrito } from './avisosTelefono';

const dispositivo = () => {
  const ua = navigator.userAgent;
  return /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone/iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'Mac' : 'Otro';
};

/** Configuración → Avisos: activar los avisos en este teléfono y (administrador) conectar el envío con la app cerrada. */
export function AvisosConfig({ esAdmin, esDemo }: { esAdmin: boolean; esDemo: boolean }) {
  const [permiso, setPermiso] = useState(permisoAvisos());
  const [conPush, setConPush] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const { mostrar, nodo } = useAviso();

  useEffect(() => { void suscrito().then(setConPush); }, []);

  const activar = async () => {
    setOcupado(true);
    try {
      const r = await activarAvisos(esDemo ? null : getSupabaseClient(), dispositivo());
      setPermiso(permisoAvisos());
      setConPush(r === 'completos');
      mostrar({ tipo: 'ok', texto: r === 'completos' ? 'Avisos activados: llegarán aunque la app esté cerrada.' : 'Avisos activados mientras la app esté abierta o en segundo plano. Para recibirlos con la app cerrada, el administrador debe conectar el envío.' });
    } catch (e) {
      setPermiso(permisoAvisos());
      mostrar({ tipo: 'error', texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="space-y-3">
      {nodo}
      <Tarjeta>
        <p className="mb-1 text-sm font-bold">Avisos en este teléfono</p>
        <p className="mb-3 text-xs text-slate-500">Te avisa cuando un pedido tuyo se despacha, sale parcial o se rechaza, cuando hay un comunicado nuevo y, a la mesa, cuando llega un pedido por procesar.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {permiso === 'granted' ? <Etiqueta tono="exito">Permitidos</Etiqueta> : permiso === 'denied' ? <Etiqueta tono="peligro">Bloqueados en el navegador</Etiqueta> : permiso === 'no_soportado' ? <Etiqueta tono="aviso">Este navegador no los permite</Etiqueta> : <Etiqueta>Sin activar</Etiqueta>}
          {permiso === 'granted' && <Etiqueta tono={conPush ? 'exito' : 'aviso'}>{conPush ? 'También con la app cerrada' : 'Solo con la app abierta'}</Etiqueta>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Boton variante="primario" icono={Bell} disabled={ocupado || permiso === 'no_soportado'} onClick={() => void activar()}>{permiso === 'granted' ? 'Volver a conectar' : 'Activar avisos'}</Boton>
          {permiso === 'granted' && <Boton onClick={() => void mostrarAviso('Aviso de prueba', 'Así se verán los avisos de NOVA.', 'prueba')}>Probar</Boton>}
          {conPush && <Boton variante="fantasma" icono={BellOff} onClick={() => void desactivarAvisos(getSupabaseClient()).then(() => setConPush(false))}>Desactivar</Boton>}
        </div>
        {permiso === 'denied' && <p className="mt-2 text-xs text-slate-500">Toca el candado junto a la dirección de la página → Permisos → Notificaciones → Permitir.</p>}
        {/iPhone|iPad/i.test(navigator.userAgent) && <p className="mt-2 text-xs text-slate-500">En iPhone los avisos funcionan con la app instalada en la pantalla de inicio (Compartir → Agregar a inicio).</p>}
      </Tarjeta>
      {esAdmin && !esDemo && <EnvioServidor />}
    </div>
  );
}

/** Solo administrador: genera las claves y guarda en la base dónde está la Edge Function "enviar-push". */
function EnvioServidor() {
  const [estado, setEstado] = useState<{ configurado: boolean; pg_net?: boolean; suscripciones?: number; personas?: number; url?: string } | null>(null);
  const [url, setUrl] = useState(() => `${getStoredSupabaseConfig().url}/functions/v1/enviar-push`);
  const [claves, setClaves] = useState<{ publica: string; privada: string; secreto: string } | null>(null);
  const [error, setError] = useState('');
  const { mostrar, nodo } = useAviso();

  const cargar = async () => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const { data, error: e } = await sb.rpc('estado_avisos');
    if (e) return setError(e.message.includes('estado_avisos') ? 'Ejecuta de nuevo nova_produccion_v3.sql para activar los avisos.' : e.message);
    setEstado(data as typeof estado);
  };
  useEffect(() => { void cargar(); }, []);

  const configurar = async () => {
    const sb = getSupabaseClient();
    if (!sb) return;
    setError('');
    const c = await generarClavesAvisos();
    const { error: e } = await sb.rpc('configurar_avisos', { p_url: url.trim(), p_secreto: c.secreto, p_vapid_publica: c.publica });
    if (e) return setError(e.message);
    setClaves(c);
    void cargar();
  };

  const copiar = (t: string) => void navigator.clipboard?.writeText(t).then(() => mostrar({ tipo: 'ok', texto: 'Copiado.' }));

  return (
    <Tarjeta>
      {nodo}
      <p className="mb-1 text-sm font-bold">Avisos con la app cerrada (administrador)</p>
      {estado && (
        <div className="mb-3 flex flex-wrap gap-2">
          <Etiqueta tono={estado.configurado ? 'exito' : 'aviso'}>{estado.configurado ? 'Conectado' : 'Sin conectar'}</Etiqueta>
          {estado.pg_net === false && <Etiqueta tono="peligro">Falta la extensión pg_net</Etiqueta>}
          {estado.suscripciones != null && <Etiqueta>{estado.personas} persona(s) · {estado.suscripciones} teléfono(s)</Etiqueta>}
        </div>
      )}
      <ol className="mb-3 list-decimal space-y-1 pl-5 text-xs text-slate-600 dark:text-slate-300">
        <li>En Supabase → Edge Functions → <b>Deploy a new function</b> → <b>Via Editor</b>: nómbrala <code>enviar-push</code>, pega el código de <code>supabase/functions/enviar-push/index.ts</code> y desactiva <b>Verify JWT</b>.</li>
        <li>Toca <b>Generar claves y conectar</b> (abajo).</li>
        <li>En Supabase → Edge Functions → <b>Secrets</b>, crea <code>VAPID_PUBLICA</code>, <code>VAPID_PRIVADA</code> y <code>AVISOS_SECRETO</code> con los valores que aparecen.</li>
        <li>Cada persona entra a Configuración → Avisos y toca <b>Activar avisos</b>.</li>
      </ol>
      <Campo rotulo="Dirección de la función"><input value={url} onChange={(e) => setUrl(e.target.value)} className={estiloInput} /></Campo>
      <Boton className="mt-3" variante="primario" icono={KeyRound} onClick={() => void configurar()}>{estado?.configurado ? 'Generar claves nuevas y reconectar' : 'Generar claves y conectar'}</Boton>
      {error && <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      {claves && (
        <div className="mt-3 space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/40">
          <p className="font-semibold text-amber-900 dark:text-amber-200">Cópialas ahora en los Secrets de la función: la privada y la clave no se vuelven a mostrar.</p>
          {([['VAPID_PUBLICA', claves.publica], ['VAPID_PRIVADA', claves.privada], ['AVISOS_SECRETO', claves.secreto]] as const).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <code className="w-32 shrink-0 font-semibold">{k}</code>
              <code className="min-w-0 flex-1 truncate">{v}</code>
              <Boton tamano="sm" icono={Copy} onClick={() => copiar(v)}>Copiar</Boton>
            </div>
          ))}
          <p className="text-amber-900 dark:text-amber-200">Si ya había teléfonos suscritos con claves anteriores, deben tocar otra vez “Activar avisos”.</p>
        </div>
      )}
    </Tarjeta>
  );
}
