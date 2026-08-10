import { useState } from 'react';
import { getMimicaCartas, MimicaItem } from '../../services/api';
import { useTeamTurnGame } from '../teams/useTeamTurnGame';
import TeamGameShell from '../teams/TeamGameShell';

// Mímica: team play en un dispositivo compartido — ver
// specs/juegos/spec.md "Mímica team turns" y design.md "Decisions — team
// play, shared device". Reutiliza el mismo módulo de turno que Tabú; solo
// añade sus propias cartas y botones (Acierto / Pasar, con coste de pasar
// configurable, por defecto sin coste).

const CATEGORIAS = ['pelicula', 'personaje_famoso', 'animal', 'profesion', 'accion'];
const DEFAULT_ROUND_SECONDS = 75; // dentro del rango 60-90s recomendado en design.md

export default function Mimica() {
  const game = useTeamTurnGame<MimicaItem>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [passPenalty, setPassPenalty] = useState(false);

  async function loadDeck(categoria?: string) {
    setError('');
    setLoading(true);
    try {
      const res = await getMimicaCartas(categoria);
      game.setDeck(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las cartas');
    } finally {
      setLoading(false);
    }
  }

  return (
    <TeamGameShell<MimicaItem>
      icon="🎭"
      title="Mímica"
      categories={CATEGORIAS}
      defaultRoundSeconds={DEFAULT_ROUND_SECONDS}
      loading={loading}
      error={error}
      onLoadDeck={loadDeck}
      game={game}
      renderCard={(item) => (
        <>
          <h2>{item.texto}</h2>
          <p className="juego-texto-secundario">Categoría: {item.categoria}</p>
        </>
      )}
      renderActions={() => (
        <div style={{ display: 'flex', gap: 12, width: '100%' }}>
          <button className="juego-boton" style={{ flex: 1 }} onClick={game.markCorrect}>
            ✅ Acierto
          </button>
          <button
            className="juego-boton-secundario"
            style={{ flex: 1 }}
            onClick={() => game.discardCard(passPenalty ? 1 : 0)}
          >
            ⏭️ Pasar
          </button>
        </div>
      )}
      renderExtraSetup={() => (
        <label className="juego-texto-secundario" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={passPenalty} onChange={(e) => setPassPenalty(e.target.checked)} />
          "Pasar" resta un punto al equipo
        </label>
      )}
    />
  );
}
