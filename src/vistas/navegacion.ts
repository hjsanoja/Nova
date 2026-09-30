/** Pequeños mensajes entre pantallas (sin librería de rutas): la pantalla destino los lee una vez al abrirse. */

const CLAVE_PEDIDO = 'nova:pedido_cliente';
const clavaSeccion = (tab: string) => `nova:seccion:${tab}`;

/** El siguiente "Tomar pedido" arranca con esta farmacia elegida. */
export function prepararPedidoPara(clienteId: string): void {
  try {
    sessionStorage.setItem(CLAVE_PEDIDO, clienteId);
  } catch {
    /* almacenamiento bloqueado: se elige la farmacia a mano */
  }
}

export function consumirClienteDePedido(): string | null {
  try {
    const id = sessionStorage.getItem(CLAVE_PEDIDO);
    if (id) sessionStorage.removeItem(CLAVE_PEDIDO);
    return id;
  } catch {
    return null;
  }
}

/** Abre un módulo directamente en una de sus secciones. */
export function irASeccion(irATab: (tab: string) => void, tab: string, seccion: string): void {
  try {
    sessionStorage.setItem(clavaSeccion(tab), seccion);
  } catch {
    /* sin almacenamiento: abre la sección inicial */
  }
  irATab(tab);
}

export function consumirSeccion<T extends string>(tab: string, validas: readonly T[], porDefecto: T): T {
  try {
    const s = sessionStorage.getItem(clavaSeccion(tab));
    if (s) sessionStorage.removeItem(clavaSeccion(tab));
    return (validas as readonly string[]).includes(s ?? '') ? (s as T) : porDefecto;
  } catch {
    return porDefecto;
  }
}
