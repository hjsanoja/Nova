// Ruta del día del vendedor: qué farmacias visitar (según su frecuencia) y en qué orden (la más cercana primero).
import { distanciaMetros } from '../offline/pedidos';
import type { ClienteConActividad } from '../vistas/logica';

export interface Parada {
  actividad: ClienteConActividad;
  /** Metros desde la parada anterior (o desde donde está el vendedor, para la primera). */
  tramo: number | null;
  visitadaHoy: boolean;
}

/** Le toca visita: nunca compró, o ya pasó (o está por pasar, `margen` días) su frecuencia. */
export const leToca = (a: ClienteConActividad, margen = 1) => a.dias == null || (a.atraso != null && a.atraso >= -margen);

const coordenadas = (a: ClienteConActividad) => (a.cliente.lat != null && a.cliente.lon != null ? { lat: a.cliente.lat, lon: a.cliente.lon } : null);

/**
 * Ordena las paradas por cercanía (vecino más cercano) empezando por `origen` (o por la más atrasada si no hay GPS).
 * Las farmacias sin ubicación van al final, de la más atrasada a la menos.
 */
export function ordenarRuta(lista: ClienteConActividad[], origen: { lat: number; lon: number } | null, visitadas: Set<string>): Parada[] {
  const conUbicacion = lista.filter((a) => coordenadas(a));
  const sinUbicacion = lista.filter((a) => !coordenadas(a)).sort((a, b) => (b.atraso ?? Infinity) - (a.atraso ?? Infinity));
  const pendientes = [...conUbicacion].sort((a, b) => (b.atraso ?? Infinity) - (a.atraso ?? Infinity));
  const ruta: Parada[] = [];
  let actual = origen;
  while (pendientes.length) {
    let mejor = 0;
    if (actual) {
      let d = Infinity;
      pendientes.forEach((a, i) => {
        const c = coordenadas(a)!;
        const m = distanciaMetros(actual!.lat, actual!.lon, c.lat, c.lon);
        if (m < d) { d = m; mejor = i; }
      });
    }
    const [a] = pendientes.splice(mejor, 1);
    const c = coordenadas(a)!;
    ruta.push({ actividad: a, tramo: actual ? Math.round(distanciaMetros(actual.lat, actual.lon, c.lat, c.lon)) : null, visitadaHoy: visitadas.has(a.cliente.id) });
    actual = c;
  }
  return [...ruta, ...sinUbicacion.map((a) => ({ actividad: a, tramo: null, visitadaHoy: visitadas.has(a.cliente.id) }))];
}

/** "850 m" / "2,4 km" */
export const distanciaTexto = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toLocaleString('es-VE', { maximumFractionDigits: 1 })} km`);

/** Enlace para abrir la navegación en Google Maps (o la app de mapas del teléfono). */
export const enlaceComoLlegar = (lat: number, lon: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
