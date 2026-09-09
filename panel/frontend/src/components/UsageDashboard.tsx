import { useState, useEffect, useCallback } from 'react';
import { getApiUsage } from '../services/api';
import type { ApiUsageEntry } from '../types';
import './UsageDashboard.css';

function formatResetTime(resetsAt: string | null): string {
  if (!resetsAt) return '—';
  return new Date(resetsAt).toLocaleString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

export default function UsageDashboard() {
  const [entries, setEntries] = useState<ApiUsageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setEntries(await getApiUsage());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el uso de APIs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="usage-dashboard">
      <div className="panel-section-header">
        <h2 className="panel-section-title">Uso de APIs externas</h2>
      </div>

      {error && <div className="panel-error">{error}</div>}

      {loading ? (
        <div className="panel-loading">
          <div className="panel-spinner" />
        </div>
      ) : (
        <div className="usage-card-grid">
          {entries.map((entry) => (
            <div key={entry.api} className="usage-card">
              <div className="usage-card-label">{entry.label}</div>
              {entry.unavailable ? (
                <div className="usage-card-unavailable">No disponible</div>
              ) : (
                <>
                  <div className="usage-card-count">
                    {entry.dailyLimit === null
                      ? `${entry.callsToday} hoy`
                      : `${entry.callsToday} de ${entry.dailyLimit} hoy`}
                  </div>
                  {entry.dailyLimit !== null && (
                    <div className="usage-card-bar">
                      <div
                        className="usage-card-bar-fill"
                        style={{ width: `${Math.min(100, (entry.callsToday! / entry.dailyLimit) * 100)}%` }}
                      />
                    </div>
                  )}
                  <div className="usage-card-reset">Reinicia {formatResetTime(entry.resetsAt)}</div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
