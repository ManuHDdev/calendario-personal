import { useEffect, useState } from 'react';
import { getNormativa, updateNormativa } from '../services/api';
import type { Normativa } from '../types';

interface FilaEdit {
  distanciaFarmaciasM: string;
  distanciaCentrosSanitariosM: string;
  verificado: boolean;
  fuenteUrl: string;
  notas: string;
}

function aEdit(n: Normativa): FilaEdit {
  return {
    distanciaFarmaciasM: n.distanciaFarmaciasM === null ? '' : String(n.distanciaFarmaciasM),
    distanciaCentrosSanitariosM: n.distanciaCentrosSanitariosM === null ? '' : String(n.distanciaCentrosSanitariosM),
    verificado: n.verificado,
    fuenteUrl: n.fuenteUrl ?? '',
    notas: n.notas ?? '',
  };
}

export default function VistaNormativa() {
  const [filas, setFilas] = useState<Normativa[]>([]);
  const [edits, setEdits] = useState<Record<string, FilaEdit>>({});
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const cargar = async () => {
    try {
      const n = await getNormativa();
      setFilas(n);
      setEdits(Object.fromEntries(n.map((f) => [f.comunidad + (f.zonaExcepcion ?? ''), aEdit(f)])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar la normativa');
    }
  };

  useEffect(() => { void cargar(); }, []);

  const clave = (f: Normativa) => f.comunidad + (f.zonaExcepcion ?? '');

  const set = (k: string, campo: keyof FilaEdit, valor: string | boolean) =>
    setEdits((prev) => ({ ...prev, [k]: { ...prev[k], [campo]: valor } }));

  const guardar = async (f: Normativa) => {
    const k = clave(f);
    const e = edits[k];
    if (!e) return;
    setGuardando(k);
    setOk(null);
    setError('');
    try {
      await updateNormativa(f.comunidad, {
        distanciaFarmaciasM: e.distanciaFarmaciasM ? Number(e.distanciaFarmaciasM) : undefined,
        distanciaCentrosSanitariosM: e.distanciaCentrosSanitariosM ? Number(e.distanciaCentrosSanitariosM) : null,
        verificado: e.verificado,
        fuenteUrl: e.fuenteUrl.trim() || null,
        notas: e.notas.trim() || null,
      });
      setOk(k);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setGuardando(null);
    }
  };

  if (error) return <p className="feed-alerta">{error}</p>;

  return (
    <div className="tabla-scroll">
      <table className="tabla">
        <thead>
          <tr>
            <th>Comunidad</th>
            <th>Dist. farmacias (m)</th>
            <th>Dist. centros (m)</th>
            <th>Verificado</th>
            <th>Fuente</th>
            <th>Notas</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const k = clave(f);
            const e = edits[k];
            if (!e) return null;
            return (
              <tr key={k}>
                <td>{f.comunidad}{f.zonaExcepcion ? ` (${f.zonaExcepcion})` : ''}</td>
                <td>
                  <input type="number" min="1" value={e.distanciaFarmaciasM}
                    onChange={(ev) => set(k, 'distanciaFarmaciasM', ev.target.value)} />
                </td>
                <td>
                  <input type="number" min="1" value={e.distanciaCentrosSanitariosM}
                    placeholder="no aplica"
                    onChange={(ev) => set(k, 'distanciaCentrosSanitariosM', ev.target.value)} />
                </td>
                <td>
                  <label className={`badge-verificado${e.verificado ? ' badge-verificado--on' : ''}`}>
                    <input type="checkbox" checked={e.verificado}
                      onChange={(ev) => set(k, 'verificado', ev.target.checked)} />
                    {e.verificado ? 'Verificado' : 'Mínimo estatal'}
                  </label>
                </td>
                <td>
                  <input type="url" value={e.fuenteUrl} placeholder="https://…"
                    onChange={(ev) => set(k, 'fuenteUrl', ev.target.value)} />
                </td>
                <td>
                  <input value={e.notas} onChange={(ev) => set(k, 'notas', ev.target.value)} />
                </td>
                <td>
                  <button className="btn-secondary btn-mini" onClick={() => void guardar(f)} disabled={guardando === k}>
                    {guardando === k ? '…' : ok === k ? '✓' : 'Guardar'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
