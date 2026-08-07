import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getVerdadORetoPrompt, newSessionId } from '../../services/api';
import '../shared.css';

export default function VerdadOReto() {
  const sessionId = useMemo(() => newSessionId(), []);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [tipo, setTipo] = useState<'verdad' | 'reto' | null>(null);
  const [error, setError] = useState('');

  async function draw(tipoElegido: 'verdad' | 'reto') {
    setError('');
    try {
      const res = await getVerdadORetoPrompt(sessionId, tipoElegido);
      setPrompt(res.prompt);
      setTipo(tipoElegido as 'verdad' | 'reto');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el prompt');
    }
  }

  return (
    <div className="juego-shell">
      <div className="juego-shell-header">
        <Link to="/" className="juego-volver">← Volver</Link>
        <h1>🎲 Verdad o Reto</h1>
      </div>

      <div className="juego-card-central">
        {prompt ? (
          <>
            <p className="juego-texto-secundario">{tipo === 'verdad' ? '🗣️ Verdad' : '🔥 Reto'}</p>
            <h2>{prompt}</h2>
          </>
        ) : (
          <p className="juego-texto-secundario">Elige: verdad o reto</p>
        )}
        {error && <p className="juego-error">{error}</p>}
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="juego-boton" onClick={() => draw('verdad')}>Verdad</button>
          <button className="juego-boton" onClick={() => draw('reto')}>Reto</button>
        </div>
      </div>
    </div>
  );
}
