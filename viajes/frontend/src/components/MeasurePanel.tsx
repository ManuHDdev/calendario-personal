import { useEffect, useMemo, useState } from 'react';
import { getDistanceMatrix, getTripDistance } from '../services/api';
import { PROFILE_LABELS, approxPrefix, formatDistance, formatDuration } from '../lib/format';
import { haversineMeters } from '../lib/geo';
import type { DistanceResult, MatrixResponse, Place, Profile } from '../types';
import type { MapRoute } from './TripMap';

interface Props {
  tripId: string;
  places: Place[];
  fromId: string;
  toId: string;
  onFromChange: (id: string) => void;
  onToChange: (id: string) => void;
  onRoutesChange: (routes: MapRoute[]) => void;
}

const MAX_MATRIX = 10;

export default function MeasurePanel({ tripId, places, fromId, toId, onFromChange, onToChange, onRoutesChange }: Props) {
  const [profile, setProfile] = useState<Profile>('driving');
  const [result, setResult] = useState<DistanceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const from = places.find((p) => p.id === fromId);
  const to = places.find((p) => p.id === toId);
  const straight = from && to ? haversineMeters(from, to) : null;

  useEffect(() => {
    setResult(null);
    setError('');
    if (!fromId || !toId || fromId === toId) return;
    let cancelled = false;
    setLoading(true);
    getTripDistance(tripId, fromId, toId, profile)
      .then((r) => !cancelled && setResult(r))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'No se pudo medir'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tripId, fromId, toId, profile]);

  useEffect(() => {
    if (result && result.geometry.length > 1) {
      onRoutesChange([{ key: 'measure', color: '#ec4899', geometry: result.geometry, dashed: result.approx }]);
    } else {
      onRoutesChange([]);
    }
  }, [result, onRoutesChange]);

  useEffect(() => () => onRoutesChange([]), [onRoutesChange]);

  // ── Matrix ──
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [matrix, setMatrix] = useState<MatrixResponse | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixError, setMatrixError] = useState('');

  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_MATRIX) next.add(id);
      return next;
    });

  const runMatrix = async () => {
    setMatrixLoading(true);
    setMatrixError('');
    try {
      setMatrix(await getDistanceMatrix(tripId, [...picked], profile, true));
    } catch (err) {
      setMatrix(null);
      setMatrixError(err instanceof Error ? err.message : 'No se pudo calcular la matriz');
    } finally {
      setMatrixLoading(false);
    }
  };

  const sorted = useMemo(() => [...places].sort((a, b) => a.name.localeCompare(b.name, 'es')), [places]);

  const select = (value: string, onChange: (id: string) => void, label: string) => (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Elige un lugar…</option>
        {sorted.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>
  );

  return (
    <div className="measure">
      <div className="segmented" role="radiogroup" aria-label="Modo de transporte">
        {(Object.keys(PROFILE_LABELS) as Profile[]).map((p) => (
          <button key={p} type="button" role="radio" aria-checked={profile === p} className={profile === p ? 'active' : ''} onClick={() => setProfile(p)}>
            {PROFILE_LABELS[p]}
          </button>
        ))}
      </div>

      <h4 className="subhead">Medir entre dos lugares</h4>
      {places.length < 2 ? (
        <p className="empty-hint">Añade al menos dos lugares para medir distancias.</p>
      ) : (
        <>
          <div className="field-row">{select(fromId, onFromChange, 'Origen')}{select(toId, onToChange, 'Destino')}</div>
          {fromId && fromId === toId && <p className="empty-hint">Elige dos lugares distintos.</p>}
          {straight !== null && fromId !== toId && (
            <dl className="measure-result">
              <dt>En línea recta</dt>
              <dd>{formatDistance(straight)}</dd>
              <dt>Por carretera ({PROFILE_LABELS[profile].toLowerCase()})</dt>
              <dd>
                {loading && 'Calculando…'}
                {!loading && result && (
                  <>
                    {approxPrefix(result.approx)}{formatDistance(result.distanceM)} · {approxPrefix(result.approx)}{formatDuration(result.durationS)}
                    {result.approx && <span className="badge badge-warn" title="El servicio de rutas no respondió; se muestra una estimación en línea recta">aproximado</span>}
                  </>
                )}
                {!loading && !result && !error && '-'}
              </dd>
            </dl>
          )}
          {error && <p className="form-error">{error}</p>}
        </>
      )}

      <h4 className="subhead">Matriz de distancias</h4>
      <p className="field-hint">Elige de 2 a {MAX_MATRIX} lugares.</p>
      <ul className="matrix-picker">
        {sorted.map((p) => (
          <li key={p.id}>
            <label className="check-field">
              <input type="checkbox" checked={picked.has(p.id)} disabled={!picked.has(p.id) && picked.size >= MAX_MATRIX} onChange={() => togglePick(p.id)} />
              <span>{p.name}</span>
            </label>
          </li>
        ))}
      </ul>
      <button type="button" className="btn-secondary" onClick={() => void runMatrix()} disabled={picked.size < 2 || matrixLoading}>
        {matrixLoading ? 'Calculando…' : 'Calcular matriz'}
      </button>
      {matrixError && <p className="form-error">{matrixError}</p>}

      {matrix && (
        <div className="matrix-wrap">
          <table className="matrix">
            <thead>
              <tr>
                <th />
                {matrix.places.map((p) => <th key={p.id} title={p.name}>{p.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {matrix.places.map((row, i) => (
                <tr key={row.id}>
                  <th title={row.name}>{row.name}</th>
                  {matrix.places.map((col, j) => (
                    <td key={col.id} className={i === j ? 'matrix-self' : undefined}>
                      {i === j ? '-' : (
                        <>
                          <strong>{matrix.road ? `${approxPrefix(matrix.road.approx)}${formatDistance(matrix.road.distancesM[i][j])}` : formatDistance(matrix.straightM[i][j])}</strong>
                          {matrix.road && <span className="matrix-sub">{approxPrefix(matrix.road.approx)}{formatDuration(matrix.road.durationsS[i][j])}</span>}
                          <span className="matrix-sub">recta {formatDistance(matrix.straightM[i][j])}</span>
                        </>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {matrix.road?.approx && <p className="approx-note">Sin datos de carretera: valores aproximados en línea recta.</p>}
        </div>
      )}
    </div>
  );
}
