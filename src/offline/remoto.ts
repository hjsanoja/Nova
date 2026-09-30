import type { TipoOutbox } from './types';

/** Clase de fallo: decide qué hace la cola con la mutación. */
export type ClaseErrorRemoto =
  | 'red'         // sin conexión, timeout o 5xx: se reintenta con espera creciente
  | 'auth'        // sesión vencida: se pausa hasta que el usuario inicie sesión
  | 'permanente'; // el servidor rechazó la operación (validación, permisos, regla de negocio)

export class ErrorRemoto extends Error {
  constructor(public clase: ClaseErrorRemoto, mensaje: string, public codigo?: string) {
    super(mensaje);
    this.name = 'ErrorRemoto';
  }
}

export type FilaRemota = Record<string, unknown>;

export interface OpcionesTraer {
  /** Solo filas creadas desde esta fecha (carga inicial acotada de pedidos y detalles). */
  creadoDesde?: string;
  /** Para relaciones anidadas (p. ej. plantillas + items). */
  seleccion?: string;
  /** Igualdades adicionales (columna -> valor). */
  filtro?: Record<string, string>;
  /** Cota inferior sobre una columna (col >= valor): p. ej. solo los últimos meses del consolidado de compras. */
  minimo?: Record<string, string>;
}

/** Puerto hacia el servidor. La cola y el motor de sync dependen solo de esta interfaz (fácil de probar). */
export interface SyncRemote {
  /** Ejecuta una mutación (RPC idempotente) y devuelve la respuesta del servidor. */
  ejecutar(tipo: TipoOutbox, payload: Record<string, unknown>): Promise<FilaRemota>;
  /** Filas modificadas después de `desde` (ordenadas por updated_at ascendente). */
  traer(tabla: string, desde: string | null, limite: number, opciones?: OpcionesTraer): Promise<FilaRemota[]>;
  traerPorId(tabla: string, id: string, seleccion?: string): Promise<FilaRemota | null>;
  haySesion(): Promise<boolean>;
  /**
   * Avisa en vivo cuando cambia alguna de estas tablas en el servidor (Supabase Realtime). `alEstado` recibe si el canal
   * quedó conectado. Devuelve la función para dejar de escuchar. Opcional: sin ella el motor solo consulta cada cierto tiempo.
   */
  /** Marca de "datos reiniciados" del servidor (cambia cuando el administrador borra datos). */
  leerEpoca?(): Promise<string | null>;
  escucharCambios?(tablas: string[], alCambiar: (tabla: string) => void, alEstado: (conectado: boolean) => void): () => void;
}
