import { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { CorridorListing, LatLng, RouteSearchResult } from '../types';

/**
 * Marker colour encodes how far off the route a listing is, so the map answers
 * "which of these is barely a detour?" at a glance rather than only after
 * reading each result.
 */
function detourColor(desvioKm: number, maxDetourKm: number): string {
  const ratio = maxDetourKm > 0 ? desvioKm / maxDetourKm : 0;
  if (ratio <= 0.33) return '#34c759';
  if (ratio <= 0.66) return '#ff9500';
  return '#ff3b30';
}

function listingIcon(listing: CorridorListing, maxDetourKm: number, selected: boolean): L.DivIcon {
  const color = detourColor(listing.desvio_km, maxDetourKm);
  const size = selected ? 26 : 18;
  return L.divIcon({
    className: 'ruta-listing-marker',
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border:${selected ? 3 : 2}px solid white;
      border-radius:50%;
      box-shadow:0 2px 8px rgba(0,0,0,.3);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function endpointIcon(label: string, color: string): L.DivIcon {
  return L.divIcon({
    className: 'ruta-endpoint-marker',
    html: `<div style="
      width:28px;height:28px;
      background:${color};color:white;
      border:2.5px solid white;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-weight:700;font-size:13px;
      box-shadow:0 2px 8px rgba(0,0,0,.35);
    ">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function popupHtml(listing: CorridorListing): string {
  const price =
    listing.price === null
      ? 'Precio a convenir'
      : `${listing.price.toFixed(0)} ${listing.currency === 'EUR' ? '€' : listing.currency}`;

  return `
    <div class="ruta-popup">
      <strong>${escapeHtml(listing.title)}</strong>
      <div class="ruta-popup__price">${price}</div>
      <div class="ruta-popup__meta">
        ${escapeHtml(listing.location)}<br/>
        ${listing.desvio_km.toFixed(1)} km de desvio · km ${listing.progreso_km.toFixed(0)} del viaje
      </div>
      <a href="${escapeHtml(listing.url)}" target="_blank" rel="noopener noreferrer">Ver en Wallapop</a>
    </div>`;
}

interface Props {
  result: RouteSearchResult | null;
  maxDetourKm: number;
  selected: CorridorListing | null;
  onSelect: (listing: CorridorListing | null) => void;
  showCoverage: boolean;
}

export default function RouteMap({ result, maxDetourKm, selected, onSelect, showCoverage }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayer = useRef<L.LayerGroup>(L.layerGroup());
  const coverageLayer = useRef<L.LayerGroup>(L.layerGroup());
  const markerLayer = useRef<L.LayerGroup>(L.layerGroup());
  const markersById = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { zoomControl: false }).setView([40.0, -3.7], 6);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    routeLayer.current.addTo(map);
    coverageLayer.current.addTo(map);
    markerLayer.current.addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Route line and endpoints.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    routeLayer.current.clearLayers();
    if (!result || result.route.polyline.length < 2) return;

    const latlngs = result.route.polyline.map((p) => [p.lat, p.lng] as [number, number]);
    const line = L.polyline(latlngs, { color: '#e07a5f', weight: 4, opacity: 0.9 });
    routeLayer.current.addLayer(line);

    const first = result.route.polyline[0];
    const last = result.route.polyline[result.route.polyline.length - 1];
    routeLayer.current.addLayer(
      L.marker([first.lat, first.lng], { icon: endpointIcon('A', '#1d1d1f') }),
    );
    routeLayer.current.addLayer(
      L.marker([last.lat, last.lng], { icon: endpointIcon('B', '#1d1d1f') }),
    );

    map.fitBounds(line.getBounds(), { padding: [40, 40] });
  }, [result]);

  // Search circles: what was actually queried, so coverage is inspectable
  // rather than something the user has to take on trust.
  useEffect(() => {
    coverageLayer.current.clearLayers();
    if (!result || !showCoverage) return;

    result.plan.centers.forEach((center: LatLng) => {
      coverageLayer.current.addLayer(
        L.circle([center.lat, center.lng], {
          radius: result.plan.radiusKm * 1000,
          color: '#0071e3',
          weight: 1,
          opacity: 0.35,
          fillOpacity: 0.05,
          interactive: false,
        }),
      );
    });
  }, [result, showCoverage]);

  const handleMarkerClick = useCallback(
    (listing: CorridorListing) => {
      onSelect(listing);
    },
    [onSelect],
  );

  // Listing markers.
  useEffect(() => {
    markerLayer.current.clearLayers();
    markersById.current.clear();
    if (!result) return;

    for (const listing of result.listings) {
      const isSelected = selected?.external_id === listing.external_id;
      const marker = L.marker([listing.latitud, listing.longitud], {
        icon: listingIcon(listing, maxDetourKm, isSelected),
      });
      marker.bindPopup(popupHtml(listing));
      marker.on('click', () => handleMarkerClick(listing));
      markerLayer.current.addLayer(marker);
      markersById.current.set(listing.external_id, marker);
    }
  }, [result, selected, maxDetourKm, handleMarkerClick]);

  // Selecting from the results list pans the map and opens the popup, so the
  // two views never disagree about what is currently being looked at.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected) return;
    const marker = markersById.current.get(selected.external_id);
    if (!marker) return;
    map.flyTo([selected.latitud, selected.longitud], Math.max(map.getZoom(), 11), {
      duration: 0.6,
    });
    marker.openPopup();
  }, [selected]);

  return <div ref={containerRef} className="ruta-map" />;
}
