import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createRoom, type GameType } from '../../services/api';
import '../shared.css';

const GAME_LABEL: Record<GameType, string> = {
  'impostor-live': '📱 El Impostor en vivo',
  'trivia-live': '🧠 Trivia en vivo',
};

export default function RoomLobby() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const initialGameType = (params.get('gameType') as GameType | null) ?? 'impostor-live';
  const [gameType, setGameType] = useState<GameType>(initialGameType);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const path = gameType === 'impostor-live' ? 'impostor' : 'trivia';

  async function handleCreate() {
    setError('');
    setCreating(true);
    try {
      const room = await createRoom(gameType);
      navigate(`/live/${path}/${room.roomCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la sala');
    } finally {
      setCreating(false);
    }
  }

  function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 4) {
      setError('El código de sala tiene 4 caracteres');
      return;
    }
    navigate(`/live/${path}/${code}`);
  }

  return (
    <div className="juego-shell">
      <div className="juego-shell-header">
        <Link to="/" className="juego-volver">← Volver</Link>
        <h1>{GAME_LABEL[gameType]}</h1>
      </div>

      <div className="juego-card-central">
        <div style={{ display: 'flex', gap: 8 }}>
          {(Object.keys(GAME_LABEL) as GameType[]).map((gt) => (
            <button
              key={gt}
              className={gt === gameType ? 'juego-boton' : 'juego-boton-secundario'}
              onClick={() => setGameType(gt)}
            >
              {GAME_LABEL[gt]}
            </button>
          ))}
        </div>

        <button className="juego-boton" disabled={creating} onClick={handleCreate}>
          {creating ? 'Creando sala…' : 'Crear sala (ser host)'}
        </button>

        <div style={{ width: '100%', textAlign: 'center' }}>
          <p className="juego-texto-secundario">— o unirse a una sala existente —</p>
          <input
            className="juego-input"
            placeholder="Código de sala (p. ej. AB3D)"
            value={joinCode}
            maxLength={4}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          />
          <div style={{ marginTop: 12 }}>
            <button className="juego-boton-secundario" onClick={handleJoin}>Unirse</button>
          </div>
        </div>

        {error && <p className="juego-error">{error}</p>}
      </div>
    </div>
  );
}
