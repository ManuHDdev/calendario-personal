import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Medicion } from '../types';

interface Props {
  punto: { lat: number; lng: number };
  farmacias?: Medicion[];
  centros?: Medicion[];
  /** Radio del umbral legal de farmacias, en metros. */
  radioM?: number | null;
}

/**
 * Los marcadores son `divIcon` a propósito: el marcador PNG por defecto de
 * Leaflet no se resuelve bajo Vite (mismo motivo por el que `paraisos` usa
 * `divIcon`), y así no hace falta parchear `L.Icon.Default`.
 */
function circulo(color: string, size: number): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;background:${color};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const ICONO_PUNTO = circulo('#c97b3c', 20);
const ICONO_FARMACIA = circulo('#34c759', 14);
const ICONO_CENTRO = circulo('#0071e3', 14);

export default function MapaViabilidad({ punto, farmacias = [], centros = [], radioM }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capa = useRef<L.LayerGroup>(L.layerGroup());

  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    const m = L.map(contenedor.current, { zoomControl: true }).setView([punto.lat, punto.lng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(m);
    capa.current.addTo(m);
    mapa.current = m;
    return () => {
      m.remove();
      mapa.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const grupo = capa.current;
    grupo.clearLayers();

    const centro = L.marker([punto.lat, punto.lng], { icon: ICONO_PUNTO });
    centro.bindPopup('Punto comprobado');
    grupo.addLayer(centro);

    if (radioM && radioM > 0) {
      grupo.addLayer(
        L.circle([punto.lat, punto.lng], {
          radius: radioM,
          color: '#c97b3c',
          weight: 1.5,
          fillColor: '#c97b3c',
          fillOpacity: 0.08,
        }),
      );
    }

    const añadir = (mediciones: Medicion[], icon: L.DivIcon, etiqueta: string) => {
      for (const med of mediciones) {
        const e = med.establecimiento;
        if (typeof e.lat !== 'number' || typeof e.lng !== 'number') continue;
        const marcador = L.marker([e.lat, e.lng], { icon });
        const metros = med.metros !== null ? `${Math.round(med.metros)} m caminando` : 'sin ruta peatonal';
        marcador.bindPopup(`<strong>${e.nombre ?? etiqueta}</strong><br/>${metros}`);
        grupo.addLayer(marcador);
      }
    };
    añadir(farmacias, ICONO_FARMACIA, 'Farmacia');
    añadir(centros, ICONO_CENTRO, 'Centro sanitario');

    const puntos: L.LatLngExpression[] = [
      [punto.lat, punto.lng],
      ...farmacias.filter((f) => f.establecimiento.lat).map((f) => [f.establecimiento.lat, f.establecimiento.lng] as L.LatLngExpression),
      ...centros.filter((c) => c.establecimiento.lat).map((c) => [c.establecimiento.lat, c.establecimiento.lng] as L.LatLngExpression),
    ];
    if (puntos.length > 1) {
      m.fitBounds(L.latLngBounds(puntos).pad(0.2));
    } else {
      m.setView([punto.lat, punto.lng], 15);
    }
  }, [punto.lat, punto.lng, farmacias, centros, radioM]);

  return <div ref={contenedor} className="mapa-viabilidad" />;
}
