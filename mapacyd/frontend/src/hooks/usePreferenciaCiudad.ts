import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';

export interface PreferenciaCiudad {
  ciudad: string;
  latitud: number;
  longitud: number;
}

export function usePreferenciaCiudad() {
  const { token } = useAuth();
  const [preferencia, setPreferencia] = useState<PreferenciaCiudad | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const API = import.meta.env.BASE_URL + 'api';

  const fetchPreferencia = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/preferences`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = (await res.json()) as PreferenciaCiudad;
      setPreferencia(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar la ciudad preferida');
    } finally {
      setLoading(false);
    }
  }, [token, API]);

  useEffect(() => {
    void fetchPreferencia();
  }, [fetchPreferencia]);

  const guardarCiudad = useCallback(async (ciudad: string) => {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/preferences`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ciudad }),
      });
      if (!res.ok) {
        let msg = `Error ${res.status}`;
        try { const b = (await res.json()) as { error?: string }; if (b.error) msg = b.error; }
        catch { /* ignore */ }
        throw new Error(msg);
      }
      const data = (await res.json()) as PreferenciaCiudad;
      setPreferencia(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al guardar la ciudad preferida';
      setError(message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  }, [token, API]);

  return { preferencia, loading, error, saving, guardarCiudad };
}
