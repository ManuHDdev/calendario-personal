import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Place, PlaceType } from '../types';
import { PLACE_TYPE_META } from '../lib/format';

export interface MapRoute {
  key: string;
  color: string;
  geometry: Array<[number, number]>;
  /** Dashed = straight-line approximation (no road geometry). */
  dashed?: boolean;
}

interface Props {
  places: Place[];
  /** Visit order number shown inside the marker of scheduled stops. */
  stopNumbers: Map<string, number>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** When true, a map click picks a location instead of deselecting. */
  picking: boolean;
  onPick: (lat: number, lng: number) => void;
  draft: { lat: number; lng: number } | null;
  routes: MapRoute[];
  /** Changes whenever the view should re-fit to all places. */
  fitSignal: number;
  /** Fly to this point (e.g. an address search result). */
  focus: { lat: number; lng: number; key: number } | null;
}

const GLYPHS: Record<PlaceType, string> = {
  alojamiento: '<path d="M3 11l9-7 9 7v9H3z"/>',
  interes: '<polygon points="12 3 14.8 9 21 9.8 16.4 14.2 17.6 21 12 17.7 6.4 21 7.6 14.2 3 9.8 9.2 9"/>',
  comida: '<path d="M7 3v7a2 2 0 0 0 4 0V3M9 10v11M17 3c-2 2-3 5-3 8h3v10"/>',
  otro: '<circle cx="12" cy="12" r="3"/>',
};

function markerIcon(place: Place, number: number | undefined, selected: boolean): L.DivIcon {
  const color = PLACE_TYPE_META[place.type].color;
  const size = selected ? 36 : 30;
  const inner =
    number !== undefined
      ? `<span class="trip-marker-num">${number}</span>`
      : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${GLYPHS[place.type]}</svg>`;
  const check = place.visited ? '<span class="trip-marker-check">&#10003;</span>' : '';
  return L.divIcon({
    className: 'trip-marker-wrap',
    html: `<div class="trip-marker${selected ? ' trip-marker--selected' : ''}${place.visited ? ' trip-marker--visited' : ''}" style="background:${color};width:${size}px;height:${size}px">${inner}${check}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const DRAFT_ICON = L.divIcon({
  className: 'trip-marker-wrap',
  html: '<div class="trip-draft"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

export default function TripMap({
  places,
  stopNumbers,
  selectedId,
  onSelect,
  picking,
  onPick,
  draft,
  routes,
  fitSignal,
  focus,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup>(L.layerGroup());
  const routesRef = useRef<L.LayerGroup>(L.layerGroup());
  const draftRef = useRef<L.Marker | null>(null);

  // Latest callbacks/flags without re-registering Leaflet handlers.
  const handlers = useRef({ onSelect, onPick, picking });
  handlers.current = { onSelect, onPick, picking };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false }).setView([40.0, -3.7], 6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    routesRef.current.addTo(map);
    markersRef.current.addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (handlers.current.picking) handlers.current.onPick(e.latlng.lat, e.latlng.lng);
      else handlers.current.onSelect(null);
    });

    mapRef.current = map;
    // The container can be laid out after mount (flex), so re-measure.
    setTimeout(() => map.invalidateSize(), 0);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const el = mapRef.current?.getContainer();
    if (el) el.style.cursor = picking ? 'crosshair' : '';
  }, [picking]);

  // Markers
  useEffect(() => {
    const group = markersRef.current;
    group.clearLayers();
    for (const place of places) {
      const marker = L.marker([place.lat, place.lng], {
        icon: markerIcon(place, stopNumbers.get(place.id), place.id === selectedId),
        zIndexOffset: place.id === selectedId ? 1000 : 0,
        keyboard: true,
        title: place.name,
      });
      marker.bindTooltip(place.name, { direction: 'top', offset: [0, -14] });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        handlers.current.onSelect(place.id);
      });
      group.addLayer(marker);
    }
  }, [places, stopNumbers, selectedId]);

  // Route polylines
  useEffect(() => {
    const group = routesRef.current;
    group.clearLayers();
    for (const route of routes) {
      if (route.geometry.length < 2) continue;
      L.polyline(route.geometry, {
        color: route.color,
        weight: 5,
        opacity: 0.85,
        dashArray: route.dashed ? '8 8' : undefined,
      }).addTo(group);
    }
  }, [routes]);

  // Draft marker (location being picked for a new/edited place)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (draftRef.current) {
      map.removeLayer(draftRef.current);
      draftRef.current = null;
    }
    if (draft) draftRef.current = L.marker([draft.lat, draft.lng], { icon: DRAFT_ICON, interactive: false }).addTo(map);
  }, [draft]);

  // Fit to all places when asked
  useEffect(() => {
    const map = mapRef.current;
    if (!map || places.length === 0) return;
    const bounds = L.latLngBounds(places.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && focus) map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), 15), { duration: 0.8 });
  }, [focus]);

  // Pan to the selected place when it is outside the view.
  useEffect(() => {
    const map = mapRef.current;
    const place = places.find((p) => p.id === selectedId);
    if (map && place && !map.getBounds().pad(-0.1).contains([place.lat, place.lng])) {
      map.panTo([place.lat, place.lng]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return <div ref={containerRef} className="trip-map" />;
}
