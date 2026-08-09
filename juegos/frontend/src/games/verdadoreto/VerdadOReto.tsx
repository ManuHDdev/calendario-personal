import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getVerdadORetoPrompt, newSessionId } from '../../services/api';
import '../shared.css';

// Dureza compartida con Yo Nunca — ver design.md "`dureza` replaces
// `categoria` as the single axis; 'Mezcla' combines all three".
const DUREZAS: { value: string; label: string }[] = [
  { value: 'suave', label: '😇 Suave' },
  { value: 'media', label: '🌶️ Media' },
  { value: 'fuerte', label: '🔥 Fuerte' },
  { value: 'mezcla', label: '🎲 Mezcla' },
];

export default function VerdadOReto() {
  const sessionId = useMemo(() => newSessionId(), []);
  const [started, setStarted] = useState(false);
  const [dureza, setDureza] = useState('mezcla');
  const [sinPareja, setSinPareja] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [tipo, setTipo] = useState<'verdad' | 'reto' | null>(null);
  const [error, setError] = useState('');

  async function draw(tipoElegido: 'verdad' | 'reto') {
    setError('');
    try {
      const res = await getVerdadORetoPrompt(
        sessionId,
        tipoElegido,
        dureza === 'mezcla' ? undefined : dureza,
        sinPareja,
      );
      setPrompt(res.prompt);
      setTipo(tipoElegido);
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

      {!started ? (
        <div className="juego-card-central">
          <label className="juego-texto-secundario">Elige el nivel de dureza</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {DUREZAS.map((d) => (
              <button
                key={d.value}
                className={d.value === dureza ? 'juego-boton' : 'juego-boton-secundario'}
                onClick={() => setDureza(d.value)}
              >
                {d.label}
              </button>
            ))}
          </div>

          <label className="juego-texto-secundario" style={{ marginTop: 16 }}>
            <input
              type="checkbox"
              checked={sinPareja}
              onChange={(e) => setSinPareja(e.target.checked)}
              style={{ marginRight: 8 }}
            />
            Modo SIN PAREJA
          </label>
          <p className="juego-texto-secundario">
            {sinPareja
              ? 'Activado: se desbloquean preguntas y retos más atrevidos. Solo si nadie en la sala está emparejado con otro jugador presente.'
              : 'Desactivado (por defecto): solo contenido seguro incluso si hay parejas jugando juntas.'}
          </p>

          {error && <p className="juego-error">{error}</p>}
          <button className="juego-boton" onClick={() => setStarted(true)}>Empezar</button>
        </div>
      ) : (
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
      )}
    </div>
  );
}
