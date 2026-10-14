import { agruparPorMes, SIN_FECHA } from '../lib/agrupar';
import {
  diaYSemana, formatFechaLarga, formatMoney, formatSignedMoney, nombreMes, pluralMovimientos,
} from '../lib/formato';
import type { Gasto } from '../types';

interface Props {
  movimientos: Gasto[];
  onEdit: (gasto: Gasto) => void;
  onDelete: (gasto: Gasto) => void;
}

const MINUS = '−';

/** Movements grouped under sticky month headers with income / expense subtotals. */
export default function MovementList({ movimientos, onEdit, onDelete }: Props) {
  const grupos = agruparPorMes(movimientos);

  return (
    <div className="movements">
      {grupos.map((grupo) => {
        const titulo = grupo.mes === SIN_FECHA ? 'Sin fecha' : nombreMes(grupo.mes);
        const headingId = `mes-${grupo.mes}`;
        return (
          <section key={grupo.mes} className="month-group" aria-labelledby={headingId}>
            <header className="month-header">
              <h3 id={headingId} className="month-name">
                {titulo}
                <span className="month-count">{pluralMovimientos(grupo.items.length)}</span>
              </h3>
              <span className="month-subtotals">
                {grupo.ganancias > 0 && <span className="positive">+{formatMoney(grupo.ganancias)}</span>}
                {grupo.gastos > 0 && <span className="negative">{MINUS}{formatMoney(grupo.gastos)}</span>}
              </span>
            </header>

            <ul className="month-rows">
              {grupo.items.map((g) => (
                <MovementRow key={g.id} gasto={g} onEdit={onEdit} onDelete={onDelete} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function MovementRow({ gasto: g, onEdit, onDelete }: { gasto: Gasto } & Pick<Props, 'onEdit' | 'onDelete'>) {
  const dia = diaYSemana(g.fecha);
  const esGanancia = g.tipo === 'ganancia';
  const descripcion = `${esGanancia ? 'Ganancia' : 'Gasto'} de ${formatMoney(g.importe)}`;

  return (
    <li className="row">
      <button
        type="button"
        className="row-main"
        onClick={() => onEdit(g)}
        aria-label={`Editar: ${g.comercio}, ${descripcion}${g.fecha ? `, ${formatFechaLarga(g.fecha)}` : ''}`}
      >
        <span className="row-date" aria-hidden="true">
          {dia ? (
            <>
              <span className="row-day">{dia.dia}</span>
              <span className="row-weekday">{dia.semana}</span>
            </>
          ) : null}
        </span>
        <span className="row-body">
          <span className="row-title">{g.comercio}</span>
          {(g.categoria || g.concepto) && (
            <span className="row-meta">
              {g.categoria && <span className="chip">{g.categoria}</span>}
              {g.concepto && <span className="row-note">{g.concepto}</span>}
            </span>
          )}
        </span>
        <span className="row-amount" aria-hidden="true">
          <span className={`row-money ${esGanancia ? 'positive' : 'negative'}`}>
            {formatSignedMoney(g.importe, g.tipo)}
          </span>
          <span className="row-kind">{esGanancia ? 'Ganancia' : 'Gasto'}</span>
        </span>
        <svg className="row-edit-hint" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      </button>
      <button
        type="button"
        className="icon-btn icon-btn--danger row-delete"
        aria-label={`Eliminar: ${g.comercio}, ${descripcion}`}
        onClick={() => onDelete(g)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      </button>
    </li>
  );
}
