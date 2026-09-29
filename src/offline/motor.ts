import type { NovaDB } from './db';
import { procesarOutbox, reintentarAhora } from './outbox';
import type { ResultadoFlush } from './outbox';
import { traerTodo } from './pull';
import type { SyncRemote } from './remoto';
import { ErrorRemoto } from './remoto';
import { actualizarEstadoSync } from './syncStore';

/**
 * Motor de sincronización bidireccional. Es "invisible": se dispara solo al recuperar la red,
 * al volver a la pestaña, cada cierto tiempo y tras cada cambio local; el usuario solo ve el indicador.
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

const INTERVALO_PULL_MS = 120_000;
const INTERVALO_OUTBOX_MS = 30_000;

export function crearMotorSync(db: NovaDB, remoto: SyncRemote | null): MotorSync {
  let enCurso: Promise<ResultadoFlush | null> | null = null;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let temporizadores: ReturnType<typeof setInterval>[] = [];
  let ultimoPull = 0;
  const limpiezas: (() => void)[] = [];

  async function ciclo(soloEnviar: boolean): Promise<ResultadoFlush | null> {
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
    if (enCurso) return enCurso;
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
    });
    return enCurso;
  }

  function solicitar() {
    if (!remoto) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => void sincronizarAhora({ soloEnviar: Date.now() - ultimoPull < 15_000 }), 300);
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

    temporizadores = [
      setInterval(() => void db.outbox.count().then((n) => n > 0 && void sincronizarAhora({ soloEnviar: true })), INTERVALO_OUTBOX_MS),
      setInterval(() => void sincronizarAhora(), INTERVALO_PULL_MS),
    ];
    void sincronizarAhora();
  }

  function detener() {
    clearTimeout(debounce);
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

export function detenerMotor(): void {
  motorActual?.detener();
  motorActual = null;
}
