import type { Balance, Transfer } from '../types';

interface Props {
  balances: Balance[];
  settlement: Transfer[];
  loading: boolean;
}

const EPS = 0.01;

export default function BalancesView({ balances, settlement, loading }: Props) {
  if (loading) return <p className="empty-hint">Calculando balances…</p>;

  return (
    <div className="balances-view">
      <div className="balances-list">
        {balances.length === 0 && <p className="empty-hint">Todavía no hay miembros en este grupo.</p>}
        {balances.map((b) => {
          const owed = b.balance > EPS;
          const owes = b.balance < -EPS;
          return (
            <div key={b.memberId} className="balance-row">
              <span className="balance-name">{b.name}</span>
              {owed && <span className="balance-amount balance-amount--owed">le deben {b.balance.toFixed(2)} €</span>}
              {owes && <span className="balance-amount balance-amount--owes">debe {Math.abs(b.balance).toFixed(2)} €</span>}
              {!owed && !owes && <span className="balance-amount balance-amount--zero">en paz</span>}
            </div>
          );
        })}
      </div>

      <h3 className="reparto-section-subtitle">Liquidación sugerida</h3>
      {settlement.length === 0 ? (
        <p className="empty-hint">No hace falta ninguna transferencia — todo cuadrado.</p>
      ) : (
        <ul className="settlement-list">
          {settlement.map((t, i) => (
            <li key={i} className="settlement-row">
              <strong>{t.fromMemberName ?? '—'}</strong> le debe <strong>{t.amount.toFixed(2)} €</strong> a{' '}
              <strong>{t.toMemberName ?? '—'}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
