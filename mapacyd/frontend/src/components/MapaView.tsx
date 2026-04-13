import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { HorarioZona, ZonaCyd, EstadoZona } from '../types/zona';
import { COLOR_ESTADO } from '../types/zona';
import { useAuth } from '../hooks/useAuth';
import { useZonas } from '../hooks/useZonas';
import { AdminPanel } from './AdminPanel';
import { ZonaModal } from './ZonaModal';
import './MapaView.css';

const CACERES: L.LatLngExpression = [39.4753, -6.3724];

// ─── Lógica de estado ────────────────────────────────────────────────────────

function getTipoDia(fecha: Date): 'LMXJV' | 'SABADO' | 'DOMINGO' {
  const d = fecha.getDay();
  if (d === 0) return 'DOMINGO';
  if (d === 6) return 'SABADO';
  return 'LMXJV';
}

export function calcularEstado(horarios: HorarioZona[], ahora: Date): EstadoZona {
  const tipoDia = getTipoDia(ahora);
  const franjas = horarios.filter(h => h.tipo_dia === tipoDia && h.activo);

  if (franjas.length === 0) return 'sin-horario';

  const horaActual =
    `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;

  for (const franja of franjas) {
    if (horaActual >= franja.hora_inicio && horaActual < franja.hora_fin) {
      return 'restringida';
    }
  }

  return 'libre';
}

// ─── Popup HTML ──────────────────────────────────────────────────────────────

const TIPOS_DIA = ['LMXJV', 'SABADO', 'DOMINGO'] as const;
const LABEL_DIA: Record<typeof TIPOS_DIA[number], string> = {
  LMXJV:   'L-V',
  SABADO:  'Sábado',
  DOMINGO: 'Domingo',
};

function buildPopupHtml(zona: ZonaCyd, estado: EstadoZona): string {
  const horarioLines = TIPOS_DIA.map(tipo => {
    const franjas = zona.horarios.filter(h => h.tipo_dia === tipo && h.activo);
    if (franjas.length === 0) {
      return `<div style="color:#9ca3af;font-size:12px">${LABEL_DIA[tipo]}: (sin restricción)</div>`;
    }
    const rangos = franjas.map(f => `${f.hora_inicio}-${f.hora_fin}`).join(' · ');
    return `<div style="font-size:12px"><b>${LABEL_DIA[tipo]}:</b> ${rangos}</div>`;
  }).join('');

  const estadoIcon  = estado === 'restringida' ? '🔴' : estado === 'libre' ? '🟢' : '⚫';
  const estadoLabel = estado === 'restringida' ? 'Zona restringida ahora'
                    : estado === 'libre'        ? 'Libre ahora'
                    :                             'Sin datos';
  const estadoColor = COLOR_ESTADO[estado];

  return `
    <div style="font-family:system-ui,sans-serif;min-width:190px;line-height:1.5">
      <div style="font-weight:600;font-size:14px;margin-bottom:4px">${zona.nombre}</div>
      ${zona.descripcion
        ? `<div style="font-size:12px;color:#9ca3af;margin-bottom:6px">${zona.descripcion}</div>`
        : ''}
      <div style="margin-bottom:8px">${horarioLines}</div>
      <div style="font-size:13px;font-weight:500;color:${estadoColor}">${estadoIcon} ${estadoLabel}</div>
    </div>
  `;
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function MapaView() {
  const { isAdmin } = useAuth();
  const [ciudadFiltro, setCiudadFiltro]   = useState<string | undefined>();
  const [tick, setTick]                   = useState(0);
  const [showAdmin, setShowAdmin]         = useState(false);
  const [modoPinActivo, setModoPinActivo] = useState(false);
  const [pinLatLng, setPinLatLng]         = useState<{ lat: number; lng: number } | null>(null);

  const { zonas, loading, error, refetch } = useZonas(ciudadFiltro);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<L.Map | null>(null);
  const markersRef   = useRef<L.CircleMarker[]>([]);

  // Inicializar el mapa una sola vez
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = L.map(containerRef.current).setView(CACERES, 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Actualizar marcadores cuando cambian zonas o tick
  useEffect(() => {
    if (!mapRef.current) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const now = new Date();
    zonas.forEach(zona => {
      const estado = calcularEstado(zona.horarios, now);
      const color  = COLOR_ESTADO[estado];

      const marker = L.circleMarker([zona.latitud, zona.longitud], {
        color,
        fillColor: color,
        radius:      12,
        fillOpacity: 0.8,
        weight:      2,
      });

      marker.bindPopup(buildPopupHtml(zona, estado));
      marker.addTo(mapRef.current!);
      markersRef.current.push(marker);
    });
  }, [zonas, tick]);

  // Recalcular colores cada 60 segundos
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Modo pin: captura el siguiente click en el mapa
  useEffect(() => {
    if (!mapRef.current || !modoPinActivo) return;
    const map = mapRef.current;
    map.getContainer().style.cursor = 'crosshair';
    const handler = (e: L.LeafletMouseEvent) => {
      setPinLatLng({ lat: e.latlng.lat, lng: e.latlng.lng });
      setModoPinActivo(false);
      map.getContainer().style.cursor = '';
    };
    map.once('click', handler);
    return () => {
      map.off('click', handler);
      map.getContainer().style.cursor = '';
    };
  }, [modoPinActivo]);

  const ciudadesUnicas = [
    'Todas las ciudades',
    ...Array.from(new Set(zonas.map(z => z.ciudad))),
  ];

  return (
    <>
      {loading && (
        <div className="mapa-spinner">
          <div className="mapa-spinner__dot" />
        </div>
      )}

      {error && (
        <div className="mapa-error">{error}</div>
      )}

      <div ref={containerRef} className="mapa-container" />

      <div className="mapa-ciudad-selector">
        <select
          value={ciudadFiltro ?? 'Todas las ciudades'}
          onChange={e =>
            setCiudadFiltro(
              e.target.value === 'Todas las ciudades' ? undefined : e.target.value,
            )
          }
        >
          {ciudadesUnicas.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {isAdmin && (
        <button className="mapa-admin-btn" onClick={() => setShowAdmin(true)}>
          Panel Admin
        </button>
      )}

      {isAdmin && showAdmin && (
        <AdminPanel
          onClose={() => setShowAdmin(false)}
          onActivarModoPin={() => setModoPinActivo(true)}
          onZonaCreada={() => void refetch()}
        />
      )}

      {pinLatLng && (
        <ZonaModal
          modo="crear"
          latitudInicial={pinLatLng.lat}
          longitudInicial={pinLatLng.lng}
          onClose={() => setPinLatLng(null)}
          onSuccess={() => { setPinLatLng(null); void refetch(); }}
        />
      )}

      {modoPinActivo && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, background: '#1a1a1a', color: '#fff',
          padding: '10px 20px', borderRadius: 8, fontSize: 13,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)', pointerEvents: 'none',
        }}>
          Haz clic en el mapa para colocar la nueva zona
        </div>
      )}
    </>
  );
}
