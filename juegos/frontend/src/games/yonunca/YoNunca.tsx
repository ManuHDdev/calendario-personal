import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getYoNuncaPrompt, newSessionId } from '../../services/api';
import '../shared.css';

// Categorías compartidas con Verdad o Reto — ver design.md "Yo Nunca / Verdad
// o Reto: categories via the existing per-category shuffle-bag pattern".
const CATEGORIAS: { value: string; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'clasico', label: '😇 Clásico' },
  { value: 'picante', label: '🌶️ Picante' },
  { value: 'fiesta', label: '🎉 Fiesta' },
];

export default function YoNunca() {
  const sessionId = useMemo(() => newSessionId(), []);
  const [started, setStarted] = useState(false);
  const [categoria, setCategoria] = useState('todas');
  const [prompt, setPrompt] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');

  async function next() {
    setError('');
    try {
      const res = await getYoNuncaPrompt(sessionId, categoria === 'todas' ? undefined : categoria);
      setPrompt(res.prompt);
      setCount((c) => c + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el prompt');
    }
  }

  async function start() {
    setStarted(true);
    await next();
  }

  return (
    <div className="juego-shell">
      <div className="juego-shell-header">
        <Link to="/" className="juego-volver">← Volver</Link>
        <h1>🙈 Yo Nunca</h1>
      </div>

      {!started ? (
        <div className="juego-card-central">
          <label className="juego-texto-secundario">Elige una categoría</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {CATEGORIAS.map((c) => (
              <button
                key={c.value}
                className={c.value === categoria ? 'juego-boton' : 'juego-boton-secundario'}
                onClick={() => setCategoria(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
          {error && <p className="juego-error">{error}</p>}
          <button className="juego-boton" onClick={start}>Empezar</button>
        </div>
      ) : (
        <div className="juego-card-central">
          {prompt ? (
            <>
              <p className="juego-texto-secundario">Ronda {count}</p>
              <h2>{prompt}</h2>
              <p className="juego-texto-secundario">Quien lo haya hecho, baja un dedo (o bebe)</p>
            </>
          ) : (
            <p className="juego-texto-secundario">Cargando…</p>
          )}
          {error && <p className="juego-error">{error}</p>}
          <button className="juego-boton" onClick={next}>Siguiente</button>
        </div>
      )}
    </div>
  );
}
