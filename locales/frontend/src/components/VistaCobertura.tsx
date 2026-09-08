import { useEffect, useState } from 'react';
import { getCobertura, getPadronResumen } from '../services/api';
import type { CoberturaMunicipio, PadronResumen } from '../types';

export default function VistaCobertura() {
  const [filas, setFilas] = useState<CoberturaMunicipio[]>([]);
  const [resumen, setResumen] = useState<PadronResumen | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const [c, r] = await Promise.all([getCobertura(true), getPadronResumen()]);
        setFilas(c);
        setResumen(r);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar la cobertura');
      }
    })();
  }, []);

  if (error) return <p className="feed-alerta">{error}</p>;

  const totalFarmacias = resumen?.farmacias.reduce((s, f) => s + f.total, 0) ?? 0;
  const totalCentros = resumen?.centros.reduce((s, f) => s + f.total, 0) ?? 0;

  return (
    <div className="cobertura">
      <p className="cobertura-resumen">
        Padrón cargado: <strong>{totalFarmacias.toLocaleString('es-ES')}</strong> farmacias ·{' '}
        <strong>{totalCentros.toLocaleString('es-ES')}</strong> centros sanitarios.
        {' '}Municipios con padrón incompleto: <strong>{filas.length}</strong>.
      </p>

      {resumen && resumen.farmacias.length > 0 && (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr><th>Comunidad</th><th>Fuente</th><th>Farmacias</th><th>Duplicados</th><th>Última importación</th></tr>
            </thead>
            <tbody>
              {resumen.farmacias.map((f, i) => (
                <tr key={i}>
                  <td>{f.comunidad}</td>
                  <td>{f.fuente}</td>
                  <td>{f.total}</td>
                  <td>{f.duplicados}</td>
                  <td>{f.ultima_importacion ? new Date(f.ultima_importacion).toLocaleDateString('es-ES') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h4 className="cobertura-titulo">Municipios donde no fiarse de un verde</h4>
      {filas.length === 0 ? (
        <p className="empty-hint">Ningún municipio marcado como incompleto.</p>
      ) : (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr><th>Municipio</th><th>Provincia</th><th>Conocidas</th><th>Esperadas</th><th>Población</th><th>Motivo</th></tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i}>
                  <td>{f.municipio}</td>
                  <td>{f.provincia ?? '—'}</td>
                  <td>{f.farmacias_conocidas}</td>
                  <td>{f.farmacias_esperadas ?? '—'}</td>
                  <td>{f.poblacion !== null ? f.poblacion.toLocaleString('es-ES') : '—'}</td>
                  <td>{f.motivo ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
