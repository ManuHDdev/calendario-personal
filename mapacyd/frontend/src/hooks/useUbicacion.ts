import { useCallback, useEffect, useRef, useState } from 'react';

export interface Ubicacion {
  lat: number;
  lng: number;
  precision: number; // metros
}

export type EstadoUbicacion = 'inactiva' | 'buscando' | 'activa' | 'denegada' | 'error';

// Seguimiento en tiempo real con la API del navegador. El permiso se pide
// al llamar a `activar()` (gesto del usuario), nunca al cargar la página.
export function useUbicacion() {
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const [estado, setEstado]       = useState<EstadoUbicacion>('inactiva');
  const watchId = useRef<number | null>(null);

  const desactivar = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setUbicacion(null);
    setEstado('inactiva');
  }, []);

  const activar = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setEstado('error');
      return;
    }
    if (watchId.current !== null) return;
    setEstado('buscando');
    watchId.current = navigator.geolocation.watchPosition(
      pos => {
        setUbicacion({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precision: pos.coords.accuracy,
        });
        setEstado('activa');
      },
      err => {
        if (watchId.current !== null) {
          navigator.geolocation.clearWatch(watchId.current);
          watchId.current = null;
        }
        setUbicacion(null);
        setEstado(err.code === err.PERMISSION_DENIED ? 'denegada' : 'error');
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
  }, []);

  useEffect(() => () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
  }, []);

  return { ubicacion, estado, activar, desactivar };
}
