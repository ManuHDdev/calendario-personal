import { useId, useState } from 'react';
import { construirResumenAnual } from '../lib/agrupar';
import { formatBalance, formatMoney, nombreMes } from '../lib/formato';
import type { TotalesPorMes } from '../types';

interface Props {
  porMes: TotalesPorMes[];
  anio: number;
  onSelectMes: (mes: string) => void;
}

function abiertoPorDefecto(): boolean {
  try {
    return window.matchMedia('(min-width: 720px)').matches;
  } catch {
    return true;
  }
}

/** "Mes a mes": twelve rows with income and expense bars; picking one narrows the page to that month. */
export default function YearOverview({ porMes, anio, onSelectMes }: Props) {
  const [abierto, setAbierto] = useState(abiertoPorDefecto);
  const panelId = useId();
  const filas = construirResumenAnual(porMes);

  return (
    <section className="overview" aria-label={`Mes a mes de ${anio}`}>
      <button
        type="button"
        className="overview-toggle"
        aria-expanded={abierto}
        aria-controls={panelId}
        onClick={() => setAbierto((a) => !a)}
      >
        <span className="overview-title">Mes a mes</span>
        <span className="overview-legend" aria-hidden="true">
          <span className="legend-dot legend-dot--income" /> Ganancias
          <span className="legend-dot legend-dot--expense" /> Gastos
        </span>
        <svg className="overview-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {abierto && (
        <ul id={panelId} className="overview-list">
          {filas.map((f) => (
            <li key={f.mes}>
              <button
                type="button"
                className={`overview-row${f.vacio ? ' overview-row--empty' : ''}`}
                onClick={() => onSelectMes(f.mes)}
                aria-label={
                  f.vacio
                    ? `${nombreMes(f.mes)}: sin movimientos. Ver el mes`
                    : `${nombreMes(f.mes)}: ganancias ${formatMoney(f.ganancias)}, gastos ${formatMoney(f.gastos)}, balance ${formatBalance(f.balance)}. Ver el mes`
                }
              >
                <span className="overview-month">{f.etiqueta}</span>
                <span className="overview-bars" aria-hidden="true">
                  <span className="bar bar--income" style={{ width: `${f.anchoGanancias}%` }} />
                  <span className="bar bar--expense" style={{ width: `${f.anchoGastos}%` }} />
                </span>
                <span
                  className={`overview-balance${f.balance > 0 ? ' positive' : f.balance < 0 ? ' negative' : ''}`}
                  aria-hidden="true"
                >
                  {f.vacio ? '—' : formatBalance(f.balance)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
