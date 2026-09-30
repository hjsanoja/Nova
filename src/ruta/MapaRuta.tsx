import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Parada } from './logica';

/**
 * Mapa de la ruta (OpenStreetMap): paradas numeradas en el orden sugerido, la ubicación del vendedor y la línea que las une.
 * Necesita internet para los mapas de fondo; sin señal la lista de abajo sigue funcionando.
 */
export function MapaRuta({ paradas, origen, onElegir }: { paradas: Parada[]; origen: { lat: number; lon: number } | null; onElegir: (clienteId: string) => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capa = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!caja.current || mapa.current) return;
    mapa.current = L.map(caja.current, { zoomControl: true, attributionControl: true }).setView([10.48, -66.9], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa.current);
    capa.current = L.layerGroup().addTo(mapa.current);
    return () => {
      mapa.current?.remove();
      mapa.current = null;
    };
  }, []);

  useEffect(() => {
    const m = mapa.current;
    const g = capa.current;
    if (!m || !g) return;
    g.clearLayers();
    const puntos: L.LatLngExpression[] = [];
    if (origen) {
      L.circleMarker([origen.lat, origen.lon], { radius: 8, color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).bindTooltip('Estás aquí').addTo(g);
      puntos.push([origen.lat, origen.lon]);
    }
    let n = 0;
    for (const p of paradas) {
      const c = p.actividad.cliente;
      if (c.lat == null || c.lon == null) continue;
      n++;
      const icono = L.divIcon({
        className: '',
        html: `<span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;border:2px solid #fff;font:600 12px Inter,sans-serif;color:#fff;background:${p.visitadaHoy ? '#64748b' : '#0f766e'};box-shadow:0 1px 3px rgba(0,0,0,.4)">${p.visitadaHoy ? '✓' : n}</span>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      L.marker([c.lat, c.lon], { icon: icono, title: c.nombre_comercial }).bindTooltip(c.nombre_comercial).on('click', () => onElegir(c.id)).addTo(g);
      puntos.push([c.lat, c.lon]);
    }
    if (puntos.length > 1) L.polyline(puntos, { color: '#0d9488', weight: 3, opacity: 0.7, dashArray: '6 6' }).addTo(g);
    if (puntos.length) m.fitBounds(L.latLngBounds(puntos), { padding: [30, 30], maxZoom: 15 });
  }, [paradas, origen, onElegir]);

  return <div ref={caja} className="relative isolate z-0 h-72 w-full overflow-hidden rounded-xl border border-slate-200 sm:h-96 dark:border-slate-800" role="region" aria-label="Mapa de la ruta" />;
}
