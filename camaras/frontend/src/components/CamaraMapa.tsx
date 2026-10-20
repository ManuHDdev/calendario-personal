import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Camara, Ciudad } from '../types';

interface Props {
  camaras: Camara[];
  ciudades: Ciudad[];
  ciudadActiva: string | null;
  seleccionadaId: number | null;
  onSeleccionar: (id: number) => void;
}

const COLOR_DGT = '#0a84ff';
const COLOR_MANUAL = '#bf5af2';
const COLOR_SELECCION = '#ff3b30';

function icono(camara: Camara, seleccionada: boolean): L.DivIcon {
  const color = seleccionada ? COLOR_SELECCION : camara.origen === 'dgt' ? COLOR_DGT : COLOR_MANUAL;
  const tam = seleccionada ? 34 : 26;
  // Anillo amarillo = favorita.
  const anillo = camara.favorita ? '#ffd60a' : 'white';
  return L.divIcon({
    className: 'cam-marker',
    html: `<div style="width:${tam}px;height:${tam}px;background:${color};border:3px solid ${anillo};border-radius:50%;
      box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;transition:transform 200ms ease">
      <svg width="${tam * 0.5}" height="${tam * 0.5}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="6" width="13" height="12" rx="2"/><path d="M15 10l7-4v12l-7-4z"/></svg></div>`,
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
  });
}

const CENTRO_EXTREMADURA: L.LatLngTuple = [39.2, -6.4];

export default function CamaraMapa({ camaras, ciudades, ciudadActiva, seleccionadaId, onSeleccionar }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capa = useRef<L.LayerGroup | null>(null);
  const marcadores = useRef<Map<number, L.Marker>>(new Map());
  const alSeleccionar = useRef(onSeleccionar);
  alSeleccionar.current = onSeleccionar;

  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    const m = L.map(contenedor.current, { zoomControl: true, attributionControl: true }).setView(CENTRO_EXTREMADURA, 8);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(m);
    capa.current = L.layerGroup().addTo(m);
    mapa.current = m;
    return () => {
      m.remove();
      mapa.current = null;
      capa.current = null;
      marcadores.current.clear();
    };
  }, []);

  // Marcadores: se reconstruyen cuando cambia el conjunto de cámaras.
  useEffect(() => {
    const grupo = capa.current;
    if (!grupo) return;
    grupo.clearLayers();
    marcadores.current.clear();
    for (const c of camaras) {
      const marcador = L.marker([c.latitud, c.longitud], {
        icon: icono(c, c.id === seleccionadaId),
        title: c.nombre,
        keyboard: true,
      });
      marcador.on('click', () => alSeleccionar.current(c.id));
      marcador.addTo(grupo);
      marcadores.current.set(c.id, marcador);
    }
    // `seleccionadaId` se omite a propósito: su efecto de abajo solo cambia iconos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camaras]);

  useEffect(() => {
    for (const c of camaras) {
      marcadores.current.get(c.id)?.setIcon(icono(c, c.id === seleccionadaId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionadaId]);

  // Encuadre: la ciudad elegida, o todas las cámaras visibles.
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const ciudad = ciudades.find((c) => c.slug === ciudadActiva);
    if (ciudad && camaras.length === 0) {
      m.setView([ciudad.latitud, ciudad.longitud], 12);
      return;
    }
    if (camaras.length > 0) {
      const limites = L.latLngBounds(camaras.map((c) => [c.latitud, c.longitud] as L.LatLngTuple));
      m.fitBounds(limites, { padding: [48, 48], maxZoom: 13 });
    } else {
      m.setView(CENTRO_EXTREMADURA, 8);
    }
  }, [ciudadActiva, ciudades, camaras]);

  // Al seleccionar una cámara, centra el mapa sin cambiar el zoom.
  useEffect(() => {
    if (seleccionadaId === null) return;
    const c = camaras.find((x) => x.id === seleccionadaId);
    if (c) mapa.current?.panTo([c.latitud, c.longitud], { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionadaId]);

  return <div ref={contenedor} className="cam-mapa" role="application" aria-label="Mapa de cámaras" />;
}
