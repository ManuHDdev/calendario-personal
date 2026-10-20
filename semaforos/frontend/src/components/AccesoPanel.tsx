import { useEffect, useState } from 'react';
import { ETIQUETA, SIGUIENTE, type AccesoDetalle, type Color, type Cruce, type EstimacionColor } from '../types';
import { elegirModelo, formatearRestante, predecir, type Confianza } from '../lib/prediccion';
import { useAhora } from '../lib/useAhora';

const COLORES: Color[] = ['verde', 'ambar', 'rojo'];
const RETRASOS_S = [0, 1, 2, 3];

const TEXTO_CONFIANZA: Record<Confianza, string> = {
  alta: 'Fiabilidad alta',
  media: 'Fiabilidad media',
  baja: 'Fiabilidad baja',
  sin_datos: 'Sin datos',
};

interface Props {
  cruce: Cruce;
  accesoId: number | null;
  detalle: AccesoDetalle | null;
  busy: boolean;
  error: string | null;
  onSelectAcceso: (id: number) => void;
  onRegistrar: (color: Color, haceS: number) => void;
  onBorrarObservacion: (id: number) => void;
  onManual: (color: Color, valor: number | null) => void;
  onRenombrarCruce: () => void;
  onRenombrarAcceso: () => void;
  onNuevoAcceso: () => void;
  onBorrarAcceso: () => void;
  onCerrar: () => void;
}

/** Un valor manual se confirma al salir del campo o con Enter; vacio lo quita. */
function ManualInput({
  valor,
  placeholder,
  onCommit,
}: {
  valor: number | null;
  placeholder: string;
  onCommit: (v: number | null) => void;
}) {
  const [texto, setTexto] = useState(valor === null ? '' : String(valor));
  useEffect(() => setTexto(valor === null ? '' : String(valor)), [valor]);

  function confirmar() {
    const limpio = texto.trim().replace(',', '.');
    if (limpio === '') {
      if (valor !== null) onCommit(null);
      return;
    }
    const n = Number(limpio);
    if (!Number.isFinite(n) || n <= 0 || n > 300) {
      setTexto(valor === null ? '' : String(valor));
      return;
    }
    if (n !== valor) onCommit(n);
  }

  return (
    <input
      className="sem-manual"
      inputMode="decimal"
      value={texto}
      placeholder={placeholder}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      aria-label="Duración manual en segundos"
    />
  );
}

function rango(e: EstimacionColor): string {
  if (e.min === null || e.max === null) return '—';
  return e.min === e.max ? `${e.min} s` : `${e.min}–${e.max} s`;
}

export default function AccesoPanel(props: Props) {
  const { cruce, accesoId, detalle, busy, error } = props;
  const ahora = useAhora();
  const [retraso, setRetraso] = useState(0);

  const acceso = cruce.accesos.find((a) => a.id === accesoId) ?? null;
  const modelo = detalle?.id === accesoId ? detalle.modelo : acceso?.modelo ?? null;
  const p = modelo ? predecir(modelo, ahora) : null;
  const activo = modelo ? elegirModelo(modelo, ahora) : null;
  const siguiente: Color | null = modelo?.ultima ? SIGUIENTE[modelo.ultima.color] : null;
  const observaciones = detalle?.id === accesoId ? detalle.observaciones : [];

  return (
    <aside className="sem-panel">
      <div className="sem-panel__head">
        <div>
          <h2>{cruce.nombre}</h2>
          <button type="button" className="sem-link" onClick={props.onRenombrarCruce}>
            Renombrar cruce
          </button>
        </div>
        <button type="button" className="sem-icon-btn" onClick={props.onCerrar} aria-label="Cerrar panel">
          ×
        </button>
      </div>

      <div className="sem-chips" role="tablist" aria-label="Accesos del cruce">
        {cruce.accesos.map((a) => {
          const pa = predecir(a.modelo, ahora);
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={a.id === accesoId}
              className={`sem-chip${a.id === accesoId ? ' sem-chip--on' : ''}`}
              onClick={() => props.onSelectAcceso(a.id)}
            >
              <span className={`sem-dot sem-dot--${pa.color ?? 'nada'}`} />
              {a.nombre}
            </button>
          );
        })}
        <button type="button" className="sem-chip sem-chip--add" onClick={props.onNuevoAcceso}>
          + Acceso
        </button>
      </div>

      {cruce.accesos.length === 0 && (
        <p className="sem-hint">
          OpenStreetMap no tiene calles de coche en este cruce. Añade un acceso a mano (nombre y rumbo de marcha).
        </p>
      )}

      {acceso && modelo && p && activo && (
        <>
          <section className="sem-estado" aria-live="off">
            <span className={`sem-semaforo sem-semaforo--${p.color ?? 'nada'}`} />
            <div>
              {p.color ? (
                <>
                  <div className="sem-estado__color">{ETIQUETA[p.color]}</div>
                  {p.exacta && p.restanteS !== null && (
                    <div className="sem-estado__cuenta">
                      cambia a {ETIQUETA[SIGUIENTE[p.color]].toLowerCase()} en{' '}
                      <strong>{formatearRestante(p.restanteS)}</strong>
                    </div>
                  )}
                  {!p.exacta && p.rango && (
                    <div className="sem-estado__cuenta">
                      cambia en{' '}
                      <strong>
                        {formatearRestante(p.rango[0])}–{formatearRestante(p.rango[1])}
                      </strong>
                    </div>
                  )}
                </>
              ) : (
                <div className="sem-estado__color sem-estado__color--nada">Sin estimación</div>
              )}
              <div className={`sem-conf sem-conf--${p.confianza}`}>
                {TEXTO_CONFIANZA[p.confianza]}
                {p.fuente && p.fuente !== 'global' ? ` · plan ${p.fuente.replace('-', ' ')}` : ''}
              </div>
              {p.motivo && <div className="sem-motivo">{p.motivo}</div>}
              {p.edadS !== null && (
                <div className="sem-motivo">Último cambio anotado hace {formatearRestante(p.edadS)}</div>
              )}
            </div>
          </section>

          <section className="sem-registrar">
            <h3>Anotar cambio</h3>
            <p className="sem-hint">Pulsa en el instante en que el semáforo pasa a ese color.</p>
            <div className="sem-botones">
              {COLORES.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={busy}
                  className={`sem-color-btn sem-color-btn--${c}${siguiente === c ? ' sem-color-btn--next' : ''}`}
                  onClick={() => props.onRegistrar(c, retraso)}
                >
                  {ETIQUETA[c]}
                </button>
              ))}
            </div>
            <div className="sem-retraso">
              <span>Llegué tarde al botón:</span>
              {RETRASOS_S.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`sem-seg${retraso === r ? ' sem-seg--on' : ''}`}
                  onClick={() => setRetraso(r)}
                >
                  {r === 0 ? 'no' : `−${r} s`}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3>
              Duraciones{' '}
              <span className={`sem-tag${activo.modelo.fijo ? ' sem-tag--ok' : ''}`}>
                {activo.modelo.fijo ? 'ciclo fijo' : 'sin ciclo claro'}
              </span>
            </h3>
            <table className="sem-tabla">
              <thead>
                <tr>
                  <th />
                  <th>Obs.</th>
                  <th>Rango</th>
                  <th>Mediana</th>
                  <th>Manual (s)</th>
                </tr>
              </thead>
              <tbody>
                {COLORES.map((c) => {
                  const e = activo.modelo[c];
                  return (
                    <tr key={c}>
                      <td>
                        <span className={`sem-dot sem-dot--${c}`} /> {ETIQUETA[c]}
                      </td>
                      <td>{e.n}</td>
                      <td>{rango(e)}</td>
                      <td>{e.mediana === null ? '—' : `${e.mediana} s`}</td>
                      <td>
                        <ManualInput
                          valor={acceso.manual[c]}
                          placeholder={e.mediana === null ? 'auto' : String(e.mediana)}
                          onCommit={(v) => props.onManual(c, v)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="sem-hint">
              Si pulsaste con retraso, corrige aquí el valor: el manual manda sobre la mediana. Vacío vuelve al
              automático.
            </p>
          </section>

          <section>
            <div className="sem-row-between">
              <h3>Últimas anotaciones</h3>
              {observaciones.length > 0 && (
                <button
                  type="button"
                  className="sem-link"
                  disabled={busy}
                  onClick={() => props.onBorrarObservacion(observaciones[0].id)}
                >
                  Deshacer la última
                </button>
              )}
            </div>
            {observaciones.length === 0 ? (
              <p className="sem-hint">Aún no hay anotaciones.</p>
            ) : (
              <ul className="sem-obs">
                {observaciones.slice(0, 12).map((o) => (
                  <li key={o.id}>
                    <span className={`sem-dot sem-dot--${o.color}`} />
                    <span>{ETIQUETA[o.color]}</span>
                    <time>{new Date(o.observado_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'medium' })}</time>
                    <button
                      type="button"
                      className="sem-icon-btn"
                      onClick={() => props.onBorrarObservacion(o.id)}
                      aria-label="Borrar anotación"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="sem-row-between sem-foot">
            <button type="button" className="sem-link" onClick={props.onRenombrarAcceso}>
              Renombrar acceso
            </button>
            <button type="button" className="sem-link sem-link--danger" onClick={props.onBorrarAcceso}>
              Borrar acceso
            </button>
          </div>
        </>
      )}

      {error && <p className="sem-error">{error}</p>}
    </aside>
  );
}
