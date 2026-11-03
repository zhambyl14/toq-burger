'use client';
import { useEffect, useRef } from 'react';
import L from 'leaflet';

export interface MapMarker {
  id: string;
  lat: number;
  lon: number;
  label: string;
  active?: boolean;
}

interface Props {
  branches?: MapMarker[];
  pin?: { lat: number; lon: number } | null;
  courier?: { lat: number; lon: number } | null;
  route?: [{ lat: number; lon: number }, { lat: number; lon: number }] | null;
  onPick?: (p: { lat: number; lon: number }) => void;
  height?: number | string;
  center?: { lat: number; lon: number };
  zoom?: number;
}

const ALMATY = { lat: 43.238, lon: 76.92 };

const pinIcon = L.divIcon({
  className: '',
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  html: '<div style="filter:drop-shadow(0 4px 4px rgba(0,0,0,.35));line-height:0"><svg width="40" height="40" viewBox="0 0 24 24" fill="#FF6A0A" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg></div>',
});
const courierIcon = L.divIcon({
  className: '',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#FF6A0A;border:3px solid #fff;animation:ping 1.4s infinite;box-sizing:border-box"></div>',
});
function branchIcon(label: string, active: boolean) {
  const bg = active ? '#FF6A0A' : '#141210';
  const safe = label.replace(/[<>&"]/g, '');
  return L.divIcon({
    className: '',
    iconSize: [90, 34],
    iconAnchor: [45, 34],
    html: `<div style="display:flex;flex-direction:column;align-items:center"><div style="background:${bg};color:#fff;border-radius:10px;padding:3px 7px;font-size:10px;font-weight:800;white-space:nowrap;font-family:Manrope,sans-serif">${safe}</div><div style="width:10px;height:10px;border-radius:50%;background:${bg};border:2px solid #fff;margin-top:2px"></div></div>`,
  });
}

export default function LeafletMap({ branches = [], pin, courier, route, onPick, height = 300, center, zoom = 12 }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const pinMarker = useRef<L.Marker | null>(null);
  const pickRef = useRef(onPick);
  const init = useRef({ c: center ?? pin ?? ALMATY, zoom });
  useEffect(() => {
    pickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    if (!el.current || map.current) return;
    const { c, zoom: z } = init.current;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([c.lat, c.lon], z);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© участники OpenStreetMap',
    }).addTo(m);
    L.control.zoom({ position: 'topright' }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => pickRef.current?.({ lat: e.latlng.lat, lon: e.latlng.lng }));
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      pinMarker.current = null;
    };
  }, []);

  // static layers: branches, courier, route
  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    branches.forEach((b) => L.marker([b.lat, b.lon], { icon: branchIcon(b.label, !!b.active), keyboard: false }).addTo(g));
    if (route) L.polyline(route.map((p) => [p.lat, p.lon] as [number, number]), { color: '#FF6A0A', weight: 4, dashArray: '8 6' }).addTo(g);
    if (courier) L.marker([courier.lat, courier.lon], { icon: courierIcon }).addTo(g);
  }, [branches, courier, route]);

  // draggable delivery pin
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!pin) {
      pinMarker.current?.remove();
      pinMarker.current = null;
      return;
    }
    if (!pinMarker.current) {
      pinMarker.current = L.marker([pin.lat, pin.lon], { icon: pinIcon, draggable: !!onPick, autoPan: true }).addTo(m);
      pinMarker.current.on('dragend', () => {
        const ll = pinMarker.current!.getLatLng();
        pickRef.current?.({ lat: ll.lat, lon: ll.lng });
      });
    } else {
      pinMarker.current.setLatLng([pin.lat, pin.lon]);
    }
    if (!m.getBounds().pad(-0.1).contains([pin.lat, pin.lon])) m.panTo([pin.lat, pin.lon]);
  }, [pin, onPick]);

  return <div ref={el} style={{ width: '100%', height, borderRadius: 'inherit', zIndex: 0 }} role="application" aria-label="Карта OpenStreetMap" />;
}
