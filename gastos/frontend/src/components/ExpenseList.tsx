import type { Gasto } from '../types';

interface Props {
  gastos: Gasto[];
  onDelete: (id: string) => Promise<void>;
}

export default function ExpenseList({ gastos, onDelete }: Props) {
  if (gastos.length === 0) {
    return <p className="empty-hint">No hay gastos confirmados para este filtro.</p>;
  }

  return (
    <div className="expense-table-wrap">
      <table className="expense-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Comercio</th>
            <th>Categoría</th>
            <th>Concepto</th>
            <th>Importe</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {gastos.map((g) => (
            <tr key={g.id}>
              <td>{g.fecha ? g.fecha.slice(0, 10) : <span className="no-data">—</span>}</td>
              <td>{g.comercio}</td>
              <td>{g.categoria || <span className="no-data">—</span>}</td>
              <td>{g.concepto || <span className="no-data">—</span>}</td>
              <td className="expense-amount">{g.importe.toFixed(2)} €</td>
              <td className="expense-actions-cell">
                <button className="tbl-btn tbl-btn--delete" title="Eliminar" onClick={() => onDelete(g.id)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14H6L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                    <path d="M9 6V4h6v2"/>
                  </svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
