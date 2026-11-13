import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MAP_CENTER } from '../config';

export interface MapPoint { id: string; lat: number; lng: number; label: string; kind: 'driver' | 'home'; stale?: boolean }

const esc = (s: string) => s.replace(/[<>&"]/g, '');
const icon = (p: MapPoint) => L.divIcon({
  className: `pin ${p.kind}${p.stale ? ' stale' : ''}`,
  html: `<span class="dot">${p.kind === 'home' ? '🏠' : '🛵'}</span>${p.label ? `<span class="tag">${esc(p.label)}</span>` : ''}`,
  iconSize: [40, 40], iconAnchor: [20, 20],
});

function useLeaflet(box: React.RefObject<HTMLDivElement>, onReady?: (m: L.Map) => void) {
  const map = useRef<L.Map | null>(null);
  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView(MAP_CENTER, 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    map.current = m;
    onReady?.(m);
    return () => { m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return map;
}

/** Mapa con puntos que se mueven en vivo (motorizados y destino). */
export function LiveMap({ points, height = 300, follow = true }: { points: MapPoint[]; height?: number | string; follow?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const line = useRef<L.Polyline | null>(null);
  const fitted = useRef(false);
  const map = useLeaflet(box);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<string>();
    for (const p of points) {
      seen.add(p.id);
      const cur = markers.current.get(p.id);
      if (cur) {
        cur.setLatLng([p.lat, p.lng]);
        cur.setIcon(icon(p));
      } else {
        markers.current.set(p.id, L.marker([p.lat, p.lng], { icon: icon(p), title: p.label, zIndexOffset: p.kind === 'driver' ? 100 : 0 }).addTo(m));
      }
    }
    for (const [id, mk] of markers.current) if (!seen.has(id)) { mk.remove(); markers.current.delete(id); }
    // Línea punteada motorizado → destino cuando hay uno de cada uno.
    const dr = points.filter((p) => p.kind === 'driver'); const home = points.filter((p) => p.kind === 'home');
    line.current?.remove(); line.current = null;
    if (dr.length === 1 && home.length === 1) {
      line.current = L.polyline([[dr[0].lat, dr[0].lng], [home[0].lat, home[0].lng]], { color: '#7d1424', weight: 3, dashArray: '6 8', opacity: 0.7 }).addTo(m);
    }
    if (points.length && (follow || !fitted.current)) {
      const b = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
      if (points.length === 1) m.setView(b.getCenter(), Math.max(m.getZoom(), 16));
      else m.fitBounds(b, { padding: [50, 50], maxZoom: 17 });
      fitted.current = true;
    }
  }, [points, follow, map]);

  return <div ref={box} className="map" style={{ height }} role="application" aria-label="Mapa en vivo" />;
}

/** Mapa para marcar el destino tocando o arrastrando el pin. */
export function PickMap({ value, onChange, height = 240 }: { value: { lat: number; lng: number } | null; onChange: (v: { lat: number; lng: number }) => void; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const marker = useRef<L.Marker | null>(null);
  const cb = useRef(onChange); cb.current = onChange;
  const map = useLeaflet(box, (m) => {
    m.on('click', (e: L.LeafletMouseEvent) => cb.current({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) }));
  });
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!value) { marker.current?.remove(); marker.current = null; return; }
    if (!marker.current) {
      marker.current = L.marker([value.lat, value.lng], { draggable: true, icon: icon({ id: 'h', lat: 0, lng: 0, label: '', kind: 'home' }) }).addTo(m);
      marker.current.on('dragend', () => { const p = marker.current!.getLatLng(); cb.current({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }); });
      m.setView([value.lat, value.lng], 17);
    } else {
      marker.current.setLatLng([value.lat, value.lng]);
      if (!m.getBounds().contains([value.lat, value.lng])) m.setView([value.lat, value.lng], 17);
    }
  }, [value, map]);
  return <div ref={box} className="map" style={{ height }} role="application" aria-label="Toca el mapa para marcar la dirección" />;
}
