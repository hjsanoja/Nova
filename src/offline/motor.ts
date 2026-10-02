import type { NovaDB } from './db';
import { procesarOutbox, reintentarAhora } from './outbox';
import type { ResultadoFlush } from './outbox';
import { traerTodo } from './pull';
import { revisarEpoca } from './epoca';
import type { SyncRemote } from './remoto';
import { ErrorRemoto } from './remoto';
import { actualizarEstadoSync } from './syncStore';

/**
 * Motor de sincronización bidireccional. Es "invisible": se dispara solo al recuperar la red,
 * al volver a la pestaña, tras cada cambio local y, EN VIVO, cuando el servidor avisa que algo cambió (Supabase Realtime).
 * Si el canal en vivo no está disponible, consulta cada INTERVALO_SIN_VIVO_MS; con él, cada INTERVALO_CON_VIVO_MS por seguridad.
 *
 *  1) envía la Outbox (mutaciones locales, idempotentes y en orden)
 *  2) baja los cambios del servidor por cursor
 *
 * Solo hay una sincronización a la vez (dentro de la pestaña y, si el navegador soporta Web Locks, entre pestañas).
 */
export interface MotorSync {
  iniciar(): void;
  detener(): void;
  /** Encola una sincronización (con debounce). */
  solicitar(): void;
  /** Ejecuta ya una sincronización completa. */
  sincronizarAhora(opciones?: { soloEnviar?: boolean }): Promise<ResultadoFlush | null>;
}

const INTERVALO_SIN_VIVO_MS = 15_000;
const INTERVALO_CON_VIVO_MS = 60_000;
const INTERVALO_OUTBOX_MS = 30_000;
const ESPERA_AVISO_MS = 800; // agrupa ráfagas de avisos (p. ej. un pedido con 20 líneas) en una sola descarga

/** Tablas que avisan en vivo. Las masivas (farmacias, productos, ventas) se revisan con la consulta periódica. */
export const TABLAS_EN_VIVO = [
  'fact_pedidos', 'fact_pedido_detalles', 'notificaciones', 'comunicados', 'metas', 'plantillas_pedido',
  'config_reglas_comerciales', 'map_cliente_drogueria', 'map_producto_drogueria', 'dim_droguerias', 'rel_cliente_vendedor',
  'dim_medicos', 'crm_tareas', 'crm_visitas', 'ciclos', 'feriados', 'motivos_actividad', 'actividades',
];

export function crearMotorSync(db: NovaDB, remoto: SyncRemote | null): MotorSync {
  let enCurso: Promise<ResultadoFlush | null> | null = null;
  // Algo pidió sincronizar mientras había un ciclo en marcha (p. ej. se envió un pedido): se repite al terminar.
  let repetir: { soloEnviar: boolean } | null = null;
  let detenido = false;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let esperaAviso: ReturnType<typeof setTimeout> | undefined;
  let enVivo = false;
  let temporizadores: ReturnType<typeof setInterval>[] = [];
  let ultimoPull = 0;
  let ultimoIntento = 0; // para la consulta periódica: si el servidor falla, no se reintenta en bucle cada 5 s
  const limpiezas: (() => void)[] = [];

  async function ciclo(soloEnviar: boolean): Promise<ResultadoFlush | null> {
    if (!soloEnviar) ultimoIntento = Date.now();
    if (!remoto || (typeof navigator !== 'undefined' && navigator.onLine === false)) return null;
    actualizarEstadoSync({ sincronizando: true });
    try {
      if (!(await remoto.haySesion())) {
        actualizarEstadoSync({ necesitaLogin: true });
        return null;
      }
      const flush = await procesarOutbox(db, remoto);
      if (flush.detenidoPor === 'auth') {
        actualizarEstadoSync({ necesitaLogin: true });
        return flush;
      }
      // Descargar solo si el envío no se cortó por la red; así se respeta el orden envío -> descarga.
      if (!flush.detenidoPor && !soloEnviar) {
        // Si el administrador borró datos en la nube, primero se descarta la copia local de lo borrado.
        await revisarEpoca(db, remoto);
        await traerTodo(db, remoto);
        ultimoPull = Date.now();
      }
      actualizarEstadoSync({ necesitaLogin: false, ultimaSync: Date.now(), ultimoError: flush.detenidoPor === 'red' ? 'Sin conexión estable' : null });
      return flush;
    } catch (e) {
      const mensaje = e instanceof ErrorRemoto || e instanceof Error ? e.message : String(e);
      actualizarEstadoSync({ ultimoError: mensaje, necesitaLogin: e instanceof ErrorRemoto && e.clase === 'auth' });
      return null;
    } finally {
      actualizarEstadoSync({ sincronizando: false });
    }
  }

  function sincronizarAhora(opciones: { soloEnviar?: boolean } = {}): Promise<ResultadoFlush | null> {
    if (enCurso) {
      repetir = { soloEnviar: (repetir ? repetir.soloEnviar : true) && !!opciones.soloEnviar };
      return enCurso;
    }
    const ejecutar = async () => {
      // Web Locks: dos pestañas abiertas no envían a la vez (igual sería seguro por idempotencia, pero desperdicia red).
      const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
      if (locks) {
        const r = await locks.request('nova-sync', { ifAvailable: true }, async (lock) => (lock ? ciclo(!!opciones.soloEnviar) : null));
        return r ?? null;
      }
      return ciclo(!!opciones.soloEnviar);
    };
    enCurso = ejecutar().finally(() => {
      enCurso = null;
      const otra = repetir;
      repetir = null;
      if (otra && !detenido) void sincronizarAhora(otra);
    });
    return enCurso;
  }

  function solicitar() {
    if (!remoto) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => void sincronizarAhora({ soloEnviar: Date.now() - ultimoPull < 15_000 }), 300);
  }

  /** El servidor avisó de un cambio: se descarga (envío + descarga) tras agrupar la ráfaga. */
  function alAvisoDelServidor() {
    clearTimeout(esperaAviso);
    esperaAviso = setTimeout(() => void sincronizarAhora(), ESPERA_AVISO_MS);
  }

  function iniciar() {
    actualizarEstadoSync({ remotoConfigurado: !!remoto, online: typeof navigator === 'undefined' ? true : navigator.onLine !== false });
    if (typeof window === 'undefined') return;

    const alConectar = () => {
      actualizarEstadoSync({ online: true });
      void reintentarAhora(db).then(() => sincronizarAhora());
    };
    const alDesconectar = () => actualizarEstadoSync({ online: false });
    const alVolver = () => {
      if (document.visibilityState === 'visible') solicitar();
    };
    // El Service Worker avisa cuando el navegador dispara Background Sync (Chrome/Android).
    const alMensajeSw = (ev: MessageEvent) => {
      if (ev.data?.tipo === 'nova-sync') void sincronizarAhora();
    };

    window.addEventListener('online', alConectar);
    window.addEventListener('offline', alDesconectar);
    document.addEventListener('visibilitychange', alVolver);
    navigator.serviceWorker?.addEventListener('message', alMensajeSw);
    limpiezas.push(
      () => window.removeEventListener('online', alConectar),
      () => window.removeEventListener('offline', alDesconectar),
      () => document.removeEventListener('visibilitychange', alVolver),
      () => navigator.serviceWorker?.removeEventListener('message', alMensajeSw)
    );

    if (remoto?.escucharCambios) {
      limpiezas.push(
        remoto.escucharCambios(TABLAS_EN_VIVO, alAvisoDelServidor, (conectado) => {
          // Al (re)conectar el canal se descarga por si algo cambió mientras estaba caído.
          if (conectado && !enVivo) alAvisoDelServidor();
          enVivo = conectado;
          actualizarEstadoSync({ enVivo: conectado });
        })
      );
    }

    temporizadores = [
      setInterval(() => void db.outbox.count().then((n) => n > 0 && void sincronizarAhora({ soloEnviar: true })), INTERVALO_OUTBOX_MS),
      // Consulta periódica: solo con la pestaña visible (ahorra batería y datos); al volver a ella se sincroniza de inmediato.
      setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        if (Date.now() - Math.max(ultimoPull, ultimoIntento) >= (enVivo ? INTERVALO_CON_VIVO_MS : INTERVALO_SIN_VIVO_MS)) void sincronizarAhora();
      }, 5_000),
    ];
    void sincronizarAhora();
  }

  function detener() {
    detenido = true;
    repetir = null;
    clearTimeout(debounce);
    clearTimeout(esperaAviso);
    temporizadores.forEach(clearInterval);
    temporizadores = [];
    limpiezas.splice(0).forEach((l) => l());
  }

  return { iniciar, detener, solicitar, sincronizarAhora };
}

/** Motor compartido de la aplicación (se crea al arrancar la sesión de trabajo). */
let motorActual: MotorSync | null = null;

export function arrancarMotor(db: NovaDB, remoto: SyncRemote | null): MotorSync {
  motorActual?.detener();
  motorActual = crearMotorSync(db, remoto);
  motorActual.iniciar();
  return motorActual;
}

/** Pide una sincronización y, si el navegador lo soporta, registra Background Sync para cuando vuelva la red. */
export function solicitarSync(): void {
  motorActual?.solicitar();
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.ready
      .then((reg) => (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync?.register('nova-outbox'))
      .catch(() => undefined);
  }
}

/** Detiene el motor indicado (o el actual). Detener un motor viejo nunca apaga al que lo reemplazó. */
export function detenerMotor(motor: MotorSync | null = motorActual): void {
  motor?.detener();
  if (motor === motorActual) motorActual = null;
}

/** ¿Hay un motor en marcha? (pruebas y diagnóstico) */
export const hayMotorEnMarcha = (): boolean => motorActual !== null;

/** Sincroniza ya (envío + descarga) y devuelve cuando termina. Para botones "Actualizar". */
export async function sincronizarYa(): Promise<void> {
  await motorActual?.sincronizarAhora();
}
