import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { HorarioZona, ZonaCyd, EstadoZona, TipoZona } from '../types/zona';
import { COLOR_ESTADO, COLOR_APARCAMIENTO } from '../types/zona';
import { useAuth } from '../hooks/useAuth';
import { useZonas } from '../hooks/useZonas';
import { usePreferenciaCiudad } from '../hooks/usePreferenciaCiudad';
import { AdminPanel } from './AdminPanel';
import { ZonaModal } from './ZonaModal';
import { PreferenciaCiudad } from './PreferenciaCiudad';
import AppLauncher from './AppLauncher';
import ThemeToggle from './ThemeToggle';
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

const popupEditBtnHtml = `
  <button class="mapa-popup-edit" style="
    margin-top:10px;width:100%;background:none;border:1px solid #0071e3;
    border-radius:6px;padding:5px 10px;font-size:12px;font-family:system-ui,sans-serif;
    color:#0071e3;cursor:pointer;
  ">Editar</button>
`;

const popupDeleteBtnHtml = `
  <button class="mapa-popup-delete" style="
    margin-top:6px;width:100%;background:none;border:1px solid #fecaca;
    border-radius:6px;padding:5px 10px;font-size:12px;font-family:system-ui,sans-serif;
    color:#dc2626;cursor:pointer;
  ">Eliminar zona</button>
`;

function popupMapsLinkHtml(zona: ZonaCyd): string {
  return `
    <a href="https://www.google.com/maps/search/?api=1&query=${zona.latitud},${zona.longitud}"
       target="_blank" rel="noopener noreferrer" style="
      display:inline-block;margin-top:4px;font-size:12px;color:#0071e3;
      text-decoration:none;font-family:system-ui,sans-serif;
    ">📍 Cómo llegar</a>
  `;
}

function buildPopupHtml(zona: ZonaCyd, estado: EstadoZona, isAdmin: boolean): string {
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
      ${popupMapsLinkHtml(zona)}
      ${isAdmin ? popupEditBtnHtml : ''}
      ${isAdmin ? popupDeleteBtnHtml : ''}
    </div>
  `;
}

function buildPopupHtmlAparcamiento(zona: ZonaCyd, isAdmin: boolean): string {
  return `
    <div style="font-family:system-ui,sans-serif;min-width:160px;line-height:1.5">
      <div style="font-weight:600;font-size:14px;margin-bottom:4px">🅿️ ${zona.nombre}</div>
      ${zona.descripcion
        ? `<div style="font-size:12px;color:#9ca3af">${zona.descripcion}</div>`
        : ''}
      ${popupMapsLinkHtml(zona)}
      ${isAdmin ? popupEditBtnHtml : ''}
      ${isAdmin ? popupDeleteBtnHtml : ''}
    </div>
  `;
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function MapaView() {
  const { isAdmin, token } = useAuth();
  const [ciudadFiltro, setCiudadFiltro]   = useState<string | undefined>();
  const [tick, setTick]                   = useState(0);
  const [showAdmin, setShowAdmin]         = useState(false);
  // Tipo de marca elegido para el próximo pin; null = modo pin inactivo
  const [modoPinTipo, setModoPinTipo]     = useState<TipoZona | null>(null);
  const [pinLatLng, setPinLatLng]         = useState<{ lat: number; lng: number } | null>(null);
  // Eliminar zona directamente desde el popup del mapa
  const [zonaEliminarPopup, setZonaEliminarPopup] = useState<ZonaCyd | null>(null);
  const [eliminandoPopup,   setEliminandoPopup]   = useState(false);
  const [errorEliminarPopup, setErrorEliminarPopup] = useState<string | null>(null);
  // Editar zona directamente desde el popup del mapa
  const [zonaEditarPopup, setZonaEditarPopup] = useState<ZonaCyd | null>(null);

  const { zonas, loading, error, refetch } = useZonas(ciudadFiltro);
  const { preferencia } = usePreferenciaCiudad();

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

  // Recentrar en la ciudad preferida del usuario en cuanto se resuelve
  // (el mapa arranca en Cáceres para no quedarse vacío mientras carga)
  useEffect(() => {
    if (!mapRef.current || !preferencia) return;
    mapRef.current.setView([preferencia.latitud, preferencia.longitud], 15);
  }, [preferencia]);

  // Actualizar marcadores cuando cambian zonas o tick
  useEffect(() => {
    if (!mapRef.current) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const now = new Date();
    zonas.forEach(zona => {
      const isAparcamiento = zona.tipo === 'aparcamiento';
      const estado = calcularEstado(zona.horarios, now);
      const color  = isAparcamiento ? COLOR_APARCAMIENTO : COLOR_ESTADO[estado];

      const marker = L.circleMarker([zona.latitud, zona.longitud], {
        color,
        fillColor: color,
        radius:      12,
        fillOpacity: 0.8,
        weight:      2,
      });

      marker.bindPopup(
        isAparcamiento
          ? buildPopupHtmlAparcamiento(zona, isAdmin)
          : buildPopupHtml(zona, estado, isAdmin),
      );
      if (isAdmin) {
        marker.on('popupopen', () => {
          const el = marker.getPopup()?.getElement();
          const btnEdit = el?.querySelector<HTMLButtonElement>('.mapa-popup-edit');
          btnEdit?.addEventListener('click', () => {
            marker.closePopup();
            setZonaEditarPopup(zona);
          });
          const btn = el?.querySelector<HTMLButtonElement>('.mapa-popup-delete');
          btn?.addEventListener('click', () => {
            marker.closePopup();
            setErrorEliminarPopup(null);
            setZonaEliminarPopup(zona);
          });
        });
      }
      marker.addTo(mapRef.current!);
      markersRef.current.push(marker);
    });
  }, [zonas, tick, isAdmin]);

  // Recalcular colores cada 60 segundos
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Modo pin: captura el siguiente click en el mapa mientras haya un tipo elegido
  useEffect(() => {
    if (!mapRef.current || !modoPinTipo) return;
    const map = mapRef.current;
    map.getContainer().style.cursor = 'crosshair';
    const handler = (e: L.LeafletMouseEvent) => {
      setPinLatLng({ lat: e.latlng.lat, lng: e.latlng.lng });
      map.getContainer().style.cursor = '';
    };
    map.once('click', handler);
    return () => {
      map.off('click', handler);
      map.getContainer().style.cursor = '';
    };
  }, [modoPinTipo]);

  const esperandoClick = modoPinTipo !== null && !pinLatLng;

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

      <AppLauncher />

      <ThemeToggle />

      <PreferenciaCiudad />

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
          onActivarModoPin={(tipo) => setModoPinTipo(tipo)}
          onZonaCreada={() => void refetch()}
        />
      )}

      {pinLatLng && (
        <ZonaModal
          modo="crear"
          tipo={modoPinTipo ?? 'carga_descarga'}
          latitudInicial={pinLatLng.lat}
          longitudInicial={pinLatLng.lng}
          onClose={() => { setPinLatLng(null); setModoPinTipo(null); }}
          onSuccess={() => {
            setPinLatLng(null);
            setModoPinTipo(null);
            void refetch();
          }}
        />
      )}

      {esperandoClick && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, background: '#1a1a1a', color: '#fff',
          padding: '10px 20px', borderRadius: 8, fontSize: 13,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)', pointerEvents: 'none',
        }}>
          {modoPinTipo === 'aparcamiento'
            ? 'Haz clic en el mapa para colocar el spot de aparcamiento'
            : 'Haz clic en el mapa para colocar la nueva zona'}
        </div>
      )}

      {/* Editar zona directamente desde el popup del mapa */}
      {zonaEditarPopup && (
        <ZonaModal
          modo="editar"
          zona={zonaEditarPopup}
          latitudInicial={zonaEditarPopup.latitud}
          longitudInicial={zonaEditarPopup.longitud}
          onClose={() => setZonaEditarPopup(null)}
          onSuccess={() => { setZonaEditarPopup(null); void refetch(); }}
        />
      )}

      {/* Eliminar zona directamente desde el popup del mapa */}
      {zonaEliminarPopup && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.35)',
          zIndex: 1200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: '28px 32px',
            maxWidth: 360, width: '90%',
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
            fontFamily: 'system-ui, sans-serif',
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1c1c1e', marginBottom: 8 }}>
              Eliminar zona
            </div>
            <div style={{ fontSize: 13, color: '#636366', marginBottom: 20, lineHeight: 1.5 }}>
              ¿Eliminar <strong>&quot;{zonaEliminarPopup.nombre}&quot;</strong>?
              Esta acción no se puede deshacer.
            </div>
            {errorEliminarPopup && (
              <div style={{ background: '#fee2e2', color: '#b91c1c', fontSize: 13, padding: '8px 12px', borderRadius: 7, marginBottom: 16 }}>
                {errorEliminarPopup}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setZonaEliminarPopup(null)}
                disabled={eliminandoPopup}
                style={{ background: '#f5f5f5', color: '#1c1c1e', border: 'none', borderRadius: 7, padding: '8px 18px', fontSize: 13, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (!token || !zonaEliminarPopup) return;
                  setEliminandoPopup(true);
                  setErrorEliminarPopup(null);
                  const API = import.meta.env.BASE_URL + 'api';
                  try {
                    const res = await fetch(`${API}/zonas/${zonaEliminarPopup.id}`, {
                      method: 'DELETE',
                      headers: { Authorization: `Bearer ${token}` },
                    });
                    if (!res.ok && res.status !== 204) {
                      let msg = `Error ${res.status}`;
                      try { const b = (await res.json()) as { error?: string }; if (b.error) msg = b.error; }
                      catch { /* ignore */ }
                      throw new Error(msg);
                    }
                    setZonaEliminarPopup(null);
                    await refetch();
                  } catch (err) {
                    setErrorEliminarPopup(err instanceof Error ? err.message : 'Error al eliminar');
                  } finally {
                    setEliminandoPopup(false);
                  }
                }}
                disabled={eliminandoPopup}
                style={{
                  background: '#dc2626', color: '#fff', border: 'none',
                  borderRadius: 7, padding: '8px 18px', fontSize: 13,
                  cursor: eliminandoPopup ? 'not-allowed' : 'pointer',
                }}
              >
                {eliminandoPopup ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
