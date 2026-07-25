import type { Totales } from '../types';

interface Props {
  totales: Totales | null;
  loading: boolean;
}

export default function TotalsView({ totales, loading }: Props) {
  if (loading) return <p className="empty-hint">Calculando totales…</p>;
  if (!totales) return null;

  return (
    <div className="totals-card">
      <div className="totals-headline">
        <span className="totals-label">Total del mes</span>
        <span className="totals-amount">{totales.total.toFixed(2)} €</span>
      </div>
      {totales.porCategoria.length > 0 && (
        <ul className="totals-breakdown">
          {totales.porCategoria.map((c) => (
            <li key={c.categoria}>
              <span>{c.categoria}</span>
              <span>{c.total.toFixed(2)} €</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
