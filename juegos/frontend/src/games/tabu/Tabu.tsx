import { useState } from 'react';
import { getTabuCartas, TabuCarta } from '../../services/api';
import { useTeamTurnGame } from '../teams/useTeamTurnGame';
import TeamGameShell from '../teams/TeamGameShell';

// Tabú: team play en un dispositivo compartido — ver specs/juegos/spec.md
// "Tabú team turns" y design.md "Decisions — team play, shared device". La
// mecánica de turno/timer/marcador vive en useTeamTurnGame; este componente
// solo añade las cartas de Tabú y sus botones de resolución (Acierto /
// ¡Prohibida!) más el overlay de reglas "?".

const CATEGORIAS = ['objetos', 'personajes', 'lugares', 'acciones', 'comida'];
const DEFAULT_ROUND_SECONDS = 60;

export default function Tabu() {
  const game = useTeamTurnGame<TabuCarta>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadDeck(categoria?: string) {
    setError('');
    setLoading(true);
    try {
      const res = await getTabuCartas(categoria);
      game.setDeck(res.cartas);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las cartas');
    } finally {
      setLoading(false);
    }
  }

  return (
    <TeamGameShell<TabuCarta>
      icon="🤐"
      title="Tabú"
      categories={CATEGORIAS}
      defaultRoundSeconds={DEFAULT_ROUND_SECONDS}
      loading={loading}
      error={error}
      onLoadDeck={loadDeck}
      game={game}
      renderCard={(carta) => (
        <>
          <h2>{carta.palabra}</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {carta.prohibidas.map((p) => (
              <li key={p} className="juego-texto-secundario" style={{ fontWeight: 600 }}>
                🚫 {p}
              </li>
            ))}
          </ul>
        </>
      )}
      renderActions={() => (
        <div style={{ display: 'flex', gap: 12, width: '100%' }}>
          <button className="juego-boton" style={{ flex: 1 }} onClick={game.markCorrect}>
            ✅ Acierto
          </button>
          <button className="juego-boton-secundario" style={{ flex: 1 }} onClick={() => game.discardCard(0)}>
            🚫 ¡Prohibida!
          </button>
        </div>
      )}
      renderRulesOverlay={() => (
        <>
          <h2>Reglas de Tabú</h2>
          <p className="juego-texto-secundario">
            Quien describe NO puede decir la palabra a adivinar, ninguna de las palabras prohibidas, "rima con...",
            ni usar gestos. Si un jugador del equipo contrario detecta que alguna se ha dicho, pulsa
            "¡Prohibida!" para descartar la carta sin puntuar.
          </p>
        </>
      )}
    />
  );
}
