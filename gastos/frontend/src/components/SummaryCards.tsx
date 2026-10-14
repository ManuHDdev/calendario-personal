import { formatBalance, formatMoney } from '../lib/formato';
import type { TotalesPeriodo } from '../types';

interface Props {
  totales: TotalesPeriodo | null;
  /** "2026" or "octubre de 2026"; shown above the cards. */
  periodoTexto: string;
  categoria: string;
  loading: boolean;
}

const MINUS = '−';

/** Income, expenses and balance of the selected period (always all three, whatever the type filter). */
export default function SummaryCards({ totales, periodoTexto, categoria, loading }: Props) {
  const balance = totales?.balance ?? 0;
  const balanceClase = balance > 0 ? 'positive' : balance < 0 ? 'negative' : 'neutral';

  return (
    <section className="summary" aria-label="Resumen" aria-busy={loading}>
      <h2 className="summary-title">
        Resumen de {periodoTexto}
        {categoria && <span className="summary-scope"> · solo «{categoria}»</span>}
      </h2>
      <div className="summary-grid">
        <div className="summary-card summary-card--income">
          <span className="summary-label">Ganancias</span>
          <span className="summary-amount">
            {totales ? `${totales.ganancias > 0 ? '+' : ''}${formatMoney(totales.ganancias)}` : '—'}
          </span>
        </div>
        <div className="summary-card summary-card--expense">
          <span className="summary-label">Gastos</span>
          <span className="summary-amount">
            {totales ? `${totales.gastos > 0 ? MINUS : ''}${formatMoney(totales.gastos)}` : '—'}
          </span>
        </div>
        <div className={`summary-card summary-card--balance summary-card--${balanceClase}`}>
          <span className="summary-label">Balance</span>
          <span className="summary-amount">{totales ? formatBalance(balance) : '—'}</span>
          <span className="summary-hint">Lo que has ganado menos lo que has gastado</span>
        </div>
      </div>
    </section>
  );
}
