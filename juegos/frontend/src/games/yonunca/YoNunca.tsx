import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getYoNuncaPrompt, newSessionId } from '../../services/api';
import '../shared.css';

export default function YoNunca() {
  const sessionId = useMemo(() => newSessionId(), []);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');

  async function next() {
    setError('');
    try {
      const res = await getYoNuncaPrompt(sessionId);
      setPrompt(res.prompt);
      setCount((c) => c + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el prompt');
    }
  }

  return (
    <div className="juego-shell">
      <div className="juego-shell-header">
        <Link to="/" className="juego-volver">← Volver</Link>
        <h1>🙈 Yo Nunca</h1>
      </div>

      <div className="juego-card-central">
        {prompt ? (
          <>
            <p className="juego-texto-secundario">Ronda {count}</p>
            <h2>{prompt}</h2>
            <p className="juego-texto-secundario">Quien lo haya hecho, baja un dedo (o bebe)</p>
          </>
        ) : (
          <p className="juego-texto-secundario">Pulsa para empezar</p>
        )}
        {error && <p className="juego-error">{error}</p>}
        <button className="juego-boton" onClick={next}>{prompt ? 'Siguiente' : 'Empezar'}</button>
      </div>
    </div>
  );
}
