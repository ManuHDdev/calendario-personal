import { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { RentabilidadZonaListing } from '../../services/api';
import type { ListingConRentabilidad } from '../../lib/rentabilidadZona';
import type { Punto } from '../../lib/geometria';

// Mismo color que las clases `.resultado-veredicto.buena/.dudosa/.mala` ya
// usadas en el listado (ver CalculatorCard.css) — el mapa no inventa una
// paleta nueva, reutiliza las variables de tema existentes. Al vivir en el
// propio DOM (no un shadow root), el marcador de Leaflet hereda las
// variables CSS del documento sin más.
const COLOR_MERECE_LA_PENA = 'var(--success)';
const COLOR_DUDOSO = 'var(--accent)';
const COLOR_NO_MERECE_LA_PENA = 'var(--danger)';
const COLOR_SIN_DATOS = 'var(--text-tertiary)';

function colorParaListing(item: ListingConRentabilidad): string {
  if (!item.resultado) return COLOR_SIN_DATOS;
  switch (item.resultado.veredicto) {
    case 'Merece la pena':
      return COLOR_MERECE_LA_PENA;
    case 'Dudoso':
      return COLOR_DUDOSO;
    case 'No merece la pena':
      return COLOR_NO_MERECE_LA_PENA;
  }
}

function crearIcono(color: string, seleccionado: boolean): L.DivIcon {
  const size = seleccionado ? 34 : 22;
  return L.divIcon({
    className: 'rentabilidad-zona-marker',
    html: `<div style="
      width: ${size}px; height: ${size}px;
      background: ${color};
      border: ${seleccionado ? 3 : 2}px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

/** Listings con coordenadas — una sin latitud/longitud no puede pintarse (sigue en la lista, solo no en el mapa). */
function conCoordenadas(listings: ListingConRentabilidad[]): ListingConRentabilidad[] {
  return listings.filter((item) => item.listing.latitud !== null && item.listing.longitud !== null);
}

interface Props {
  listings: ListingConRentabilidad[];
  selectedListing: RentabilidadZonaListing | null;
  onSelect: (listing: RentabilidadZonaListing) => void;
  /** `true` mientras el usuario está dibujando una zona (cursor en cruz, clics añaden vértices). */
  dibujando: boolean;
  /** Vértices de la zona ya cerrada (mostrada como polígono relleno) — `null` si no hay zona activa. */
  zonaCerrada: Punto[] | null;
  /** Vértices del polígono en curso de dibujo (mostrado como línea, aún sin cerrar). */
  verticesEnCurso: Punto[];
  /** Se llama con cada clic en el mapa mientras `dibujando` es `true`. */
  onAgregarVertice: (punto: Punto) => void;
}

// Mismo patrón que paraisos/frontend/src/components/SpotMap.tsx: leaflet
// plano (no react-leaflet), mapa creado una vez en un efecto con cleanup,
// L.divIcon por marcador, L.layerGroup repoblado en cada cambio de datos/
// selección y flyTo en la selección. El ajuste de vista inicial ("mostrar
// todos los puntos") sigue el mismo patrón fitBounds que
// locales/frontend/src/components/MapaViabilidad.tsx.
export default function RentabilidadZonaMapa({
  listings,
  selectedListing,
  onSelect,
  dibujando,
  zonaCerrada,
  verticesEnCurso,
  onAgregarVertice,
}: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup>(L.layerGroup());
  const dibujoRef = useRef<L.LayerGroup>(L.layerGroup());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false }).setView([39.5, -3.0], 6);

    L.tileLayer(
      'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
        maxZoom: 19,
      },
    ).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    markersRef.current.addTo(map);
    dibujoRef.current.addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const handleMarkerClick = useCallback((listing: RentabilidadZonaListing) => onSelect(listing), [onSelect]);

  // Cursor en cruz mientras se dibuja: mismo patrón que `pickingMode` en
  // `paraisos/frontend/src/components/SpotMap.tsx`.
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.getContainer().style.cursor = dibujando ? 'crosshair' : '';
  }, [dibujando]);

  // Clic en el mapa en modo dibujo → nuevo vértice. Se desactiva el arrastre
  // en modo dibujo (mismo criterio que un modo de "picking": el gesto
  // principal del clic es añadir un punto, no mover el mapa) y se reactiva
  // al salir de él.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (dibujando) {
      map.dragging.disable();
    } else {
      map.dragging.enable();
    }

    const handleClick = (e: L.LeafletMouseEvent) => {
      if (!dibujando) return;
      onAgregarVertice([e.latlng.lat, e.latlng.lng]);
    };
    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [dibujando, onAgregarVertice]);

  // Pinta el polígono cerrado (relleno) o la línea en curso (sin cerrar),
  // más un marcador especial en el primer vértice mientras se dibuja, para
  // que "cerrar la zona" tenga un objetivo visible y no sea un truco oculto.
  useEffect(() => {
    const group = dibujoRef.current;
    group.clearLayers();

    if (zonaCerrada && zonaCerrada.length >= 3) {
      L.polygon(zonaCerrada as L.LatLngExpression[], {
        color: 'var(--accent)',
        weight: 2,
        fillOpacity: 0.12,
      }).addTo(group);
      return;
    }

    if (verticesEnCurso.length > 0) {
      if (verticesEnCurso.length > 1) {
        L.polyline(verticesEnCurso as L.LatLngExpression[], { color: 'var(--accent)', weight: 2, dashArray: '6 6' }).addTo(
          group,
        );
      }
      verticesEnCurso.forEach((v, i) => {
        const esPrimero = i === 0;
        L.circleMarker(v, {
          radius: esPrimero && verticesEnCurso.length >= 3 ? 7 : 4,
          color: 'var(--accent)',
          weight: esPrimero ? 3 : 1,
          fillColor: 'white',
          fillOpacity: 1,
        }).addTo(group);
      });
    }
  }, [zonaCerrada, verticesEnCurso]);

  // Repuebla los marcadores en cada cambio de datos o de selección (mismo
  // efecto único que SpotMap, no dos efectos duplicados haciendo lo mismo).
  useEffect(() => {
    const group = markersRef.current;
    group.clearLayers();

    conCoordenadas(listings).forEach((item) => {
      const { listing } = item;
      const isSelected = selectedListing?.url === listing.url;
      const icon = crearIcono(colorParaListing(item), isSelected);
      const marker = L.marker([listing.latitud as number, listing.longitud as number], { icon });
      marker.on('click', () => handleMarkerClick(listing));
      group.addLayer(marker);
    });
  }, [listings, selectedListing, handleMarkerClick]);

  // Vista inicial / cuando cambia el conjunto de resultados (nueva
  // búsqueda): encajar todos los puntos plotados, no solo el seleccionado.
  // Deliberadamente NO depende de `selectedListing` — eso lo lleva el flyTo
  // de más abajo, para no pelear entre "encajar todo" y "volar a uno".
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const puntos = conCoordenadas(listings).map(
      (item) => [item.listing.latitud as number, item.listing.longitud as number] as L.LatLngExpression,
    );

    if (puntos.length === 1) {
      map.setView(puntos[0], 15);
    } else if (puntos.length > 1) {
      map.fitBounds(L.latLngBounds(puntos).pad(0.2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings]);

  // Volar al listing seleccionado (por marcador o por fila de la lista).
  useEffect(() => {
    if (selectedListing && mapRef.current && selectedListing.latitud !== null && selectedListing.longitud !== null) {
      mapRef.current.flyTo([selectedListing.latitud, selectedListing.longitud], 16, { duration: 0.8 });
    }
  }, [selectedListing]);

  return <div ref={containerRef} className="rentabilidad-zona-mapa" />;
}
