import type { Usuario } from '../../types/pharmacy';

/* Cuándo se muestra la guía de bienvenida (módulo pequeño: la guía en sí se descarga solo cuando se abre). */

const clave = (id: string) => `NOVA_GUIA_VISTA:${id}`;

/** La guía se muestra si la persona nunca la vio (según la base, y si la base aún no lo registra, según este equipo). */
export function debeVerGuia(u: Pick<Usuario, 'id' | 'guia_vista_en'>): boolean {
  if (u.guia_vista_en) return false;
  try {
    return localStorage.getItem(clave(u.id)) === null;
  } catch {
    return false;
  }
}

export function recordarGuiaVista(id: string): void {
  try {
    localStorage.setItem(clave(id), new Date().toISOString());
  } catch {
    /* sin almacenamiento */
  }
}

/** Abrir la guía desde cualquier pantalla (Ayuda). */
export const EVENTO_ABRIR_GUIA = 'nova:abrir-guia';
export const abrirGuia = () => window.dispatchEvent(new Event(EVENTO_ABRIR_GUIA));
