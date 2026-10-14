import { construirTiraMeses } from '../lib/agrupar';
import { nombreMes } from '../lib/formato';
import type { TotalesPorMes } from '../types';

interface Props {
  anio: number;
  minAnio: number;
  maxAnio: number;
  /** Selected month (YYYY-MM) or null for the whole year. */
  mes: string | null;
  porMes: TotalesPorMes[] | undefined;
  onAnioChange: (anio: number) => void;
  onMesChange: (mes: string | null) => void;
}

/** Year stepper plus a strip with "Todo el año" and the twelve months. */
export default function PeriodBar({ anio, minAnio, maxAnio, mes, porMes, onAnioChange, onMesChange }: Props) {
  const tira = construirTiraMeses(anio, porMes);

  return (
    <section className="period-bar" aria-label="Periodo">
      <div className="year-stepper">
        <button
          type="button"
          className="icon-btn"
          aria-label="Año anterior"
          disabled={anio <= minAnio}
          onClick={() => onAnioChange(anio - 1)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h2 className="year-label" aria-live="polite">{anio}</h2>
        <button
          type="button"
          className="icon-btn"
          aria-label="Año siguiente"
          disabled={anio >= maxAnio}
          onClick={() => onAnioChange(anio + 1)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
      </div>

      <div className="month-strip" role="group" aria-label="Elegir mes">
        <button
          type="button"
          className={`month-chip month-chip--all${mes === null ? ' month-chip--on' : ''}`}
          aria-pressed={mes === null}
          onClick={() => onMesChange(null)}
        >
          Todo el año
        </button>
        {tira.map((m) => (
          <button
            key={m.mes}
            type="button"
            className={`month-chip${mes === m.mes ? ' month-chip--on' : ''}${m.conMovimientos ? '' : ' month-chip--empty'}`}
            aria-pressed={mes === m.mes}
            aria-label={`${nombreMes(m.mes)}${m.conMovimientos ? ', con movimientos' : ', sin movimientos'}`}
            onClick={() => onMesChange(m.mes)}
          >
            {m.etiqueta}
            <span className="month-dot" aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
