import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDiezDeDiezRonda, newSessionId } from '../../services/api';
import '../shared.css';

// 10/10 (ver design.md "Decisions — pass-and-play games: 10/10" y
// specs/juegos/spec.md "10/10 combined prompts"). Cada ronda combina un
// item de la bolsa `cualidad` y otro de la bolsa `pero`, ambos filtrados por
// la MISMA intensidad seleccionada — el backend ya garantiza esto sirviendo
// ambos en la misma respuesta. Sin condición de victoria; el recuento
// sí/no es opcional y solo muestra un porcentaje, no se acumula entre
// rondas.

type Phase = 'setup' | 'ronda' | 'votacion' | 'resultado';
type Intensidad = 'suave' | 'picante';

export default function DiezDeDiez() {
  const sessionId = useMemo(() => newSessionId(), []);
  const [phase, setPhase] = useState<Phase>('setup');
  const [intensidad, setIntensidad] = useState<Intensidad>('suave');
  const [cualidad, setCualidad] = useState('');
  const [pero, setPero] = useState('');
  const [ronda, setRonda] = useState(0);
  const [siVotes, setSiVotes] = useState(0);
  const [noVotes, setNoVotes] = useState(0);
  const [error, setError] = useState('');

  async function next() {
    setError('');
    try {
      const res = await getDiezDeDiezRonda(sessionId, intensidad);
      setCualidad(res.cualidad);
      setPero(res.pero);
      setRonda((r) => r + 1);
      setSiVotes(0);
      setNoVotes(0);
      setPhase('ronda');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la ronda');
    }
  }

  async function start() {
    await next();
  }

  const totalVotes = siVotes + noVotes;
  const siPct = totalVotes > 0 ? Math.round((siVotes / totalVotes) * 100) : 0;

  return (
    <div className="juego-shell">
      <div className="juego-shell-header">
        <Link to="/" className="juego-volver">← Volver</Link>
        <h1>🔟 10/10</h1>
      </div>

      {phase === 'setup' && (
        <div className="juego-card-central">
          <label className="juego-texto-secundario">Elige la intensidad</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={intensidad === 'suave' ? 'juego-boton' : 'juego-boton-secundario'}
              onClick={() => setIntensidad('suave')}
            >
              😇 Suave
            </button>
            <button
              className={intensidad === 'picante' ? 'juego-boton' : 'juego-boton-secundario'}
              onClick={() => setIntensidad('picante')}
            >
              🌶️ Picante
            </button>
          </div>
          {error && <p className="juego-error">{error}</p>}
          <button className="juego-boton" onClick={start}>Empezar</button>
        </div>
      )}

      {phase === 'ronda' && (
        <div className="juego-card-central">
          <p className="juego-texto-secundario">Ronda {ronda}</p>
          <h2>Le doy un 10/10 en {cualidad}</h2>
          <h2>...pero {pero}</h2>
          {error && <p className="juego-error">{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="juego-boton" onClick={next}>Siguiente</button>
            <button className="juego-boton-secundario" onClick={() => setPhase('votacion')}>
              Votar Sí/No (opcional)
            </button>
          </div>
        </div>
      )}

      {phase === 'votacion' && (
        <div className="juego-card-central">
          <h2>¿Alguien lo firmaría?</h2>
          <p className="juego-texto-secundario">Levantad la mano para Sí o No y tocad el contador correspondiente</p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="juego-boton" onClick={() => setSiVotes((n) => n + 1)}>👍 Sí: {siVotes}</button>
            <button className="juego-boton-secundario" onClick={() => setNoVotes((n) => n + 1)}>👎 No: {noVotes}</button>
          </div>
          <button className="juego-boton" onClick={() => setPhase('resultado')}>Ver resultado</button>
        </div>
      )}

      {phase === 'resultado' && (
        <div className="juego-card-central">
          <h2>{totalVotes > 0 ? `${siPct}% dice Sí` : 'Sin votos esta ronda'}</h2>
          <p className="juego-texto-secundario">{siVotes} sí — {noVotes} no</p>
          <button className="juego-boton" onClick={next}>Siguiente ronda</button>
        </div>
      )}
    </div>
  );
}
