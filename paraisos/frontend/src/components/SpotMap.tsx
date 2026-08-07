import { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Spot } from '../types';

const CATEGORY_COLORS: Record<string, string> = {
  piscina: '#007aff',
  ruta: '#34c759',
  playa: '#ff9500',
};

function createMarkerIcon(categoria: string): L.DivIcon {
  const color = CATEGORY_COLORS[categoria] || '#007aff';
  return L.divIcon({
    className: 'spot-marker',
    html: `<div style="
      width: 28px; height: 28px;
      background: ${color};
      border: 2.5px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      transition: transform 200ms ease;
    "></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

const SELECTED_ICON = L.divIcon({
  className: 'spot-marker-selected',
  html: `<div style="
    width: 36px; height: 36px;
    background: #ff3b30;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 2px 12px rgba(255,59,48,0.4);
  "></div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -20],
});

const PARKING_ICON = L.divIcon({
  className: 'parking-marker',
  html: `<div style="
    background: #007aff;
    color: white;
    width: 24px; height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 12px;
    border: 2px solid white;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  ">P</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const PIN_ICON = L.divIcon({
  className: 'measure-pin-marker',
  html: `<div style="
    width: 30px; height: 30px;
    position: relative;
  ">
    <svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 1c-6.6 0-12 5.4-12 12 0 9 12 16 12 16s12-7 12-16c0-6.6-5.4-12-12-12z"
        fill="#ff2d55" stroke="white" stroke-width="2"/>
      <circle cx="15" cy="13" r="4.5" fill="white"/>
    </svg>
  </div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 29],
  popupAnchor: [0, -26],
});

interface Props {
  spots: Spot[];
  selectedSpot: Spot | null;
  onSpotSelect: (spot: Spot | null) => void;
  onMapClick?: (lat: number, lng: number) => void;
  pickingMode?: 'spot' | 'parking' | 'create' | null;
  parkingMarker?: { lat: number; lng: number } | null;
  measurePin?: { lat: number; lng: number } | null;
}

export default function SpotMap({ spots, selectedSpot, onSpotSelect, onMapClick, pickingMode, parkingMarker, measurePin }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup>(L.layerGroup());
  const parkingMarkerRef = useRef<L.Marker | null>(null);
  const measurePinRef = useRef<L.Marker | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: false,
    }).setView([39.5, -3.0], 6);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    markersRef.current.addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Register map click handler
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !onMapClick) return;

    const handler = (e: L.LeafletMouseEvent) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    };
    map.on('click', handler);
    return () => { map.off('click', handler); };
  }, [onMapClick]);

  // Toggle crosshair cursor for picking mode
  useEffect(() => {
    if (!mapRef.current) return;
    const container = mapRef.current.getContainer();
    container.style.cursor = pickingMode ? 'crosshair' : '';
  }, [pickingMode]);

  const handleMarkerClick = useCallback(
    (spot: Spot) => {
      onSpotSelect(spot);
      if (mapRef.current) {
        mapRef.current.flyTo([spot.latitud, spot.longitud], 12, { duration: 0.8 });
      }
    },
    [onSpotSelect],
  );

  useEffect(() => {
    const group = markersRef.current;
    group.clearLayers();

    spots.forEach((spot) => {
      const isSelected = selectedSpot?.id === spot.id;
      const icon = isSelected ? SELECTED_ICON : createMarkerIcon(spot.categoria);
      const marker = L.marker([spot.latitud, spot.longitud], { icon });
      marker.on('click', () => handleMarkerClick(spot));
      group.addLayer(marker);
    });
  }, [spots, selectedSpot, handleMarkerClick]);

  // Parking marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old parking marker
    if (parkingMarkerRef.current) {
      map.removeLayer(parkingMarkerRef.current);
      parkingMarkerRef.current = null;
    }

    // Add new one if needed
    if (parkingMarker) {
      const marker = L.marker([parkingMarker.lat, parkingMarker.lng], { icon: PARKING_ICON });
      marker.addTo(map);
      parkingMarkerRef.current = marker;
    }
  }, [parkingMarker]);

  // Measure pin marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old pin marker
    if (measurePinRef.current) {
      map.removeLayer(measurePinRef.current);
      measurePinRef.current = null;
    }

    // Add new one if needed
    if (measurePin) {
      const marker = L.marker([measurePin.lat, measurePin.lng], { icon: PIN_ICON });
      marker.addTo(map);
      measurePinRef.current = marker;
    }
  }, [measurePin]);

  useEffect(() => {
    if (selectedSpot && mapRef.current) {
      mapRef.current.flyTo([selectedSpot.latitud, selectedSpot.longitud], 12, { duration: 0.8 });
    }
  }, [selectedSpot]);

  return <div ref={containerRef} className="spot-map" />;
}
