import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import type { ZonaCyd } from '../types/zona';

export function useZonas(ciudad?: string) {
  const { token } = useAuth();
  const [zonas, setZonas]     = useState<ZonaCyd[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError]     = useState<string | null>(null);

  const fetchZonas = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const url = ciudad
        ? `/api/zonas?ciudad=${encodeURIComponent(ciudad)}`
        : '/api/zonas';
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        let msg = `Error ${res.status}`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) msg = body.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      const data = (await res.json()) as ZonaCyd[];
      setZonas(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar las zonas');
    } finally {
      setLoading(false);
    }
  }, [token, ciudad]);

  useEffect(() => {
    void fetchZonas();
  }, [fetchZonas]);

  return { zonas, loading, error, refetch: fetchZonas };
}
