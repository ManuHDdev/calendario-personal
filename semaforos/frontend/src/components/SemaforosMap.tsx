import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Acceso, Color, Cruce } from '../types';
import { posicionAcceso, predecir, type Prediccion } from '../lib/prediccion';

const COLOR_HEX: Record<Color, string> = {
  verde: '#32d74b',
  ambar: '#ffd60a',
  rojo: '#ff453a',
};
const DESCONOCIDO = '#8e8e93';

interface MarcadorAcceso {
  marker: L.Marker;
  acceso: Acceso;
  /** Lo ultimo pintado, para no reconstruir el icono cada segundo sin motivo. */
  pintado: string;
}

function claveVisual(p: Prediccion, seleccionado: boolean): string {
  return `${p.color ?? '-'}|${p.confianza}|${seleccionado ? 1 : 0}`;
}

function iconoAcceso(p: Prediccion, seleccionado: boolean): L.DivIcon {
  const color = p.color ? COLOR_HEX[p.color] : DESCONOCIDO;
  const size = seleccionado ? 26 : 18;
  // Una prediccion poco fiable se ve distinta de una buena: borde discontinuo.
  const borde = p.color && p.confianza === 'baja' ? 'dashed' : 'solid';
  const aro = seleccionado ? '0 0 0 4px rgba(0,113,227,.45), ' : '';
  return L.divIcon({
    className: 'sem-marker',
    html: `<div class="sem-marker__dot" style="
      width:${size}px;height:${size}px;background:${color};
      border:2.5px ${borde} #fff;border-radius:50%;
      box-shadow:${aro}0 2px 6px rgba(0,0,0,.35);
      opacity:${p.color ? 1 : 0.7};"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function iconoCruceSinAccesos(): L.DivIcon {
  return L.divIcon({
    className: 'sem-marker',
    html: '<div style="width:12px;height:12px;background:#8e8e93;border:2px solid #fff;border-radius:3px;transform:rotate(45deg);box-shadow:0 1px 4px rgba(0,0,0,.35);"></div>',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

interface Props {
  cruces: Cruce[];
  selectedAccesoId: number | null;
  selectedCruceId: number | null;
  onSelect: (cruceId: number, accesoId: number | null) => void;
}

export default function SemaforosMap({ cruces, selectedAccesoId, selectedCruceId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const capa = useRef<L.LayerGroup>(L.layerGroup());
  const marcadores = useRef<Map<number, MarcadorAcceso>>(new Map());
  const selRef = useRef<number | null>(selectedAccesoId);
  const ultimoAjuste = useRef<string>('');
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  selRef.current = selectedAccesoId;

  // Mapa: se crea una vez.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false }).setView([39.4765, -6.3722], 14);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors (ODbL) &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    capa.current.addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Marcadores: se reconstruyen cuando cambian los datos, no cada segundo.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    capa.current.clearLayers();
    marcadores.current.clear();
    const ahora = Date.now();
    const puntos: L.LatLngTuple[] = [];

    for (const cruce of cruces) {
      puntos.push([cruce.lat, cruce.lng]);
      if (cruce.accesos.length === 0) {
        const m = L.marker([cruce.lat, cruce.lng], { icon: iconoCruceSinAccesos() });
        m.on('click', () => onSelectRef.current(cruce.id, null));
        m.bindTooltip(`${cruce.nombre} · sin accesos`);
        capa.current.addLayer(m);
        continue;
      }
      for (const acceso of cruce.accesos) {
        const [lat, lng] = posicionAcceso(cruce.lat, cruce.lng, acceso.rumbo_grados);
        const p = predecir(acceso.modelo, ahora);
        const sel = acceso.id === selRef.current;
        const marker = L.marker([lat, lng], { icon: iconoAcceso(p, sel), zIndexOffset: sel ? 1000 : 0 });
        marker.on('click', () => onSelectRef.current(cruce.id, acceso.id));
        marker.bindTooltip(`${cruce.nombre} — ${acceso.nombre}`);
        capa.current.addLayer(marker);
        marcadores.current.set(acceso.id, { marker, acceso, pintado: claveVisual(p, sel) });
      }
    }

    // Encuadra la ciudad solo cuando cambia el conjunto, no tras cada observacion.
    const huella = `${cruces.length}:${cruces[0]?.ciudad ?? ''}`;
    if (puntos.length > 0 && huella !== ultimoAjuste.current) {
      map.fitBounds(L.latLngBounds(puntos), { padding: [40, 40], maxZoom: 16 });
      ultimoAjuste.current = huella;
    }
  }, [cruces]);

  // Cada segundo: solo se toca el marcador cuyo color/confianza cambio.
  useEffect(() => {
    const id = setInterval(() => {
      const ahora = Date.now();
      marcadores.current.forEach((m) => {
        const sel = m.acceso.id === selRef.current;
        const p = predecir(m.acceso.modelo, ahora);
        const clave = claveVisual(p, sel);
        if (clave === m.pintado) return;
        m.marker.setIcon(iconoAcceso(p, sel));
        m.marker.setZIndexOffset(sel ? 1000 : 0);
        m.pintado = clave;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Seleccion: repinta el aro y centra el mapa en el acceso elegido.
  useEffect(() => {
    const ahora = Date.now();
    marcadores.current.forEach((m) => {
      const sel = m.acceso.id === selectedAccesoId;
      const p = predecir(m.acceso.modelo, ahora);
      const clave = claveVisual(p, sel);
      if (clave === m.pintado) return;
      m.marker.setIcon(iconoAcceso(p, sel));
      m.marker.setZIndexOffset(sel ? 1000 : 0);
      m.pintado = clave;
    });
    const map = mapRef.current;
    const cruce = cruces.find((c) => c.id === selectedCruceId);
    if (map && cruce) {
      map.flyTo([cruce.lat, cruce.lng], Math.max(map.getZoom(), 17), { duration: 0.5 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccesoId, selectedCruceId]);

  return <div ref={containerRef} className="sem-map" />;
}

