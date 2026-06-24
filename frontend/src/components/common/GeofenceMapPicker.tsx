import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon paths broken by Vite asset hashing
const DEFAULT_ICON = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

interface Props {
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  onChange: (lat: number, lng: number) => void;
  height?: number;
}

export function GeofenceMapPicker({ latitude, longitude, radiusMeters, onChange, height = 320 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center: L.LatLngExpression = latitude && longitude ? [latitude, longitude] : [10.0, 76.5];
    const map = L.map(containerRef.current).setView(center, latitude && longitude ? 15 : 8);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    if (latitude && longitude) {
      markerRef.current = L.marker([latitude, longitude], { icon: DEFAULT_ICON, draggable: true }).addTo(map);
      circleRef.current = L.circle([latitude, longitude], { radius: radiusMeters, color: '#1677ff', fillOpacity: 0.1 }).addTo(map);

      markerRef.current.on('dragend', () => {
        const pos = markerRef.current!.getLatLng();
        circleRef.current?.setLatLng(pos);
        onChange(pos.lat, pos.lng);
      });
    }

    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
        circleRef.current?.setLatLng([lat, lng]);
      } else {
        markerRef.current = L.marker([lat, lng], { icon: DEFAULT_ICON, draggable: true }).addTo(map);
        circleRef.current = L.circle([lat, lng], { radius: radiusMeters, color: '#1677ff', fillOpacity: 0.1 }).addTo(map);
        markerRef.current.on('dragend', () => {
          const pos = markerRef.current!.getLatLng();
          circleRef.current?.setLatLng(pos);
          onChange(pos.lat, pos.lng);
        });
      }
      onChange(lat, lng);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync radius changes
  useEffect(() => {
    circleRef.current?.setRadius(radiusMeters);
  }, [radiusMeters]);

  // Sync lat/lng when changed from outside (e.g. "Use My Location")
  useEffect(() => {
    if (!mapRef.current || latitude == null || longitude == null) return;
    const latlng: L.LatLngExpression = [latitude, longitude];
    if (markerRef.current) {
      markerRef.current.setLatLng(latlng);
      circleRef.current?.setLatLng(latlng);
    } else {
      markerRef.current = L.marker(latlng, { icon: DEFAULT_ICON, draggable: true }).addTo(mapRef.current);
      circleRef.current = L.circle(latlng, { radius: radiusMeters, color: '#1677ff', fillOpacity: 0.1 }).addTo(mapRef.current);
      markerRef.current.on('dragend', () => {
        const pos = markerRef.current!.getLatLng();
        circleRef.current?.setLatLng(pos);
        onChange(pos.lat, pos.lng);
      });
    }
    mapRef.current.setView(latlng, 15);
  }, [latitude, longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} style={{ height, width: '100%', borderRadius: 6, overflow: 'hidden' }} />;
}
