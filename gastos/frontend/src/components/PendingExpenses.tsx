import { totalesPrevistos } from '../lib/agrupar';
import { formatFechaCorta, formatMoney, formatSignedMoney, hoyLocal } from '../lib/formato';
import type { Gasto } from '../types';

interface Props {
  gastos: Gasto[];
  onOccurred: (gasto: Gasto) => void;
  onEdit: (gasto: Gasto) => void;
  onDiscard: (gasto: Gasto) => void;
}

/** Forecasts (estado 'previsto'): known amounts that have not happened yet and never count in totals. */
export default function PendingExpenses({ gastos, onOccurred, onEdit, onDiscard }: Props) {
  if (gastos.length === 0) return null;

  const { porPagar, porCobrar } = totalesPrevistos(gastos);
  const hoy = hoyLocal();

  return (
    <section id="previstos" className="forecasts" aria-labelledby="previstos-titulo">
      <div className="section-head">
        <h2 id="previstos-titulo" className="section-title">Previstos</h2>
        <p className="section-sub">Todavía no han pasado, así que no cuentan en los totales.</p>
      </div>

      <div className="forecast-totals">
        {porPagar > 0 && (
          <span className="forecast-total">
            Por pagar <strong className="negative">{formatMoney(porPagar)}</strong>
          </span>
        )}
        {porCobrar > 0 && (
          <span className="forecast-total">
            Por cobrar <strong className="positive">{formatMoney(porCobrar)}</strong>
          </span>
        )}
      </div>

      <ul className="forecast-list">
        {gastos.map((g) => {
          const esGanancia = g.tipo === 'ganancia';
          const pasada = !!g.fecha && g.fecha.slice(0, 10) < hoy;
          return (
            <li key={g.id} className="forecast">
              <div className="forecast-info">
                <span className="forecast-title">{g.comercio}</span>
                <span className="forecast-meta">
                  <span className={pasada ? 'forecast-date forecast-date--late' : 'forecast-date'}>
                    {g.fecha ? formatFechaCorta(g.fecha) : 'Sin fecha'}
                    {pasada && ' · la fecha ya pasó'}
                  </span>
                  {g.categoria && <span className="chip">{g.categoria}</span>}
                </span>
              </div>
              <div className="forecast-amount">
                <span className={`row-money ${esGanancia ? 'positive' : 'negative'}`}>
                  {formatSignedMoney(g.importe, g.tipo)}
                </span>
                <span className="row-kind">{esGanancia ? 'Por cobrar' : 'Por pagar'}</span>
              </div>
              <div className="forecast-actions">
                <button type="button" className="btn btn--tonal" onClick={() => onOccurred(g)}>
                  Ya ha ocurrido
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => onEdit(g)}>
                  Editar
                </button>
                <button type="button" className="btn btn--ghost btn--danger-text" onClick={() => onDiscard(g)}>
                  Descartar
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
