import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import keycloak from '../../services/keycloak';
import { RoomSocketClient, type WsMessage } from '../../services/ws';
import '../shared.css';

// ─────────────────────────────────────────────────────────────────────────
// Coup en vivo — ver spec.md "Coup action/challenge/block resolution" y
// design.md "Decisions — multi-device rooms" → "Coup". El servidor
// (games/coupLive.ts) es la única fuente de verdad; este componente solo
// refleja los broadcasts/whispers que llegan por WebSocket. La mano privada
// de cada jugador SOLO llega por whisper ('hand-assigned'/'hand-updated'),
// nunca por el `state` público que se retransmite a todos.
// ─────────────────────────────────────────────────────────────────────────

type CoupCharacter = 'duque' | 'asesino' | 'capitan' | 'embajador' | 'condesa';
type CoupActionType = 'ingresos' | 'ayuda-externa' | 'golpe-estado' | 'duque' | 'asesino' | 'capitan' | 'embajador';

interface PlayerInfo {
  id: string;
  username: string;
  isHost: boolean;
  connected: boolean;
}

interface PublicPlayer {
  playerId: string;
  username: string;
  coins: number;
  influenceCount: number;
  revealed: CoupCharacter[];
  eliminated: boolean;
}

interface PublicState {
  phase: 'lobby' | 'in-progress' | 'ended';
  turnPlayerId: string | null;
  deckCount: number;
  winnerId: string | null;
  players: PublicPlayer[];
}

interface PendingActionInfo {
  actionType: CoupActionType;
  actorId: string;
  targetId: string | null;
  claimedCharacter: CoupCharacter | null;
  stage: 'action' | 'block';
  blockerId: string | null;
  blockClaim: CoupCharacter | null;
  passedIds: string[];
}

interface ExchangeInfo {
  options: CoupCharacter[];
  keepCount: number;
}

const CHARACTER_LABEL: Record<CoupCharacter, string> = {
  duque: '👑 Duque',
  asesino: '🗡️ Asesino',
  capitan: '⚓ Capitán',
  embajador: '🕊️ Embajador',
  condesa: '🛡️ Condesa',
};

const ACTION_LABEL: Record<CoupActionType, string> = {
  ingresos: '💰 Ingresos (+1)',
  'ayuda-externa': '🤝 Ayuda externa (+2)',
  'golpe-estado': '⚔️ Golpe de estado (-7)',
  duque: '👑 Duque (+3)',
  asesino: '🗡️ Asesino (-3, elimina influencia)',
  capitan: '⚓ Capitán (roba 2)',
  embajador: '🕊️ Embajador (intercambia cartas)',
};

// Reglas de bloqueo — reflejan ACTION_RULES en coupLive.ts, solo para pintar
// la UI de respuesta (el servidor sigue siendo quien valida de verdad).
const BLOCKABLE_BY: Record<CoupActionType, CoupCharacter[]> = {
  ingresos: [],
  'ayuda-externa': ['duque'],
  'golpe-estado': [],
  duque: [],
  asesino: ['condesa'],
  capitan: ['capitan', 'embajador'],
  embajador: [],
};
const BLOCK_RESTRICTED_TO_TARGET: Partial<Record<CoupActionType, true>> = { asesino: true, capitan: true };
const CHALLENGEABLE: Partial<Record<CoupActionType, true>> = { duque: true, asesino: true, capitan: true, embajador: true };
const MANDATORY_COUP_COINS = 10;
const RESPONSE_WINDOW_SECONDS = 20; // solo visual — el servidor no aplica ningún límite de tiempo real

export default function CoupLive() {
  const { code } = useParams<{ code: string }>();
  const clientRef = useRef<RoomSocketClient | null>(null);
  const [status, setStatus] = useState<'connecting' | 'open' | 'reconnecting' | 'closed'>('connecting');
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [publicState, setPublicState] = useState<PublicState | null>(null);
  const [myHand, setMyHand] = useState<CoupCharacter[] | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingActionInfo | null>(null);
  const [exchange, setExchange] = useState<ExchangeInfo | null>(null);
  const [exchangeSelection, setExchangeSelection] = useState<CoupCharacter[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESPONSE_WINDOW_SECONDS);

  const myId = (keycloak.tokenParsed as { sub?: string } | undefined)?.sub;
  const me = players.find((p) => p.id === myId);

  function pushLog(entry: string) {
    setLog((prev) => [entry, ...prev].slice(0, 30));
  }

  function nameOf(id: string | null): string {
    if (!id) return '?';
    return publicState?.players.find((p) => p.playerId === id)?.username ?? players.find((p) => p.id === id)?.username ?? id;
  }

  useEffect(() => {
    if (!code) return;

    const client = new RoomSocketClient({
      roomCode: code,
      onStatusChange: setStatus,
      onMessage: (message: WsMessage) => {
        switch (message.type) {
          case 'players-updated':
            setPlayers(message.players as PlayerInfo[]);
            break;
          case 'game-started':
            setPublicState(message.state as PublicState);
            setPendingAction(null);
            setExchange(null);
            pushLog('🎬 La partida ha comenzado');
            break;
          case 'hand-assigned':
          case 'hand-updated':
            setMyHand(message.influence as CoupCharacter[]);
            break;
          case 'exchange-pending':
            setExchange({ options: message.options as CoupCharacter[], keepCount: message.keepCount as number });
            setExchangeSelection([]);
            break;
          case 'action-declared':
            setPublicState(message.state as PublicState);
            setPendingAction({
              actionType: message.actionType as CoupActionType,
              actorId: message.actorId as string,
              targetId: (message.targetId as string | null) ?? null,
              claimedCharacter: (message.claimedCharacter as CoupCharacter | null) ?? null,
              stage: 'action',
              blockerId: null,
              blockClaim: null,
              passedIds: [],
            });
            setSecondsLeft(RESPONSE_WINDOW_SECONDS);
            pushLog(`👉 ${nameOf(message.actorId as string)} declara ${ACTION_LABEL[message.actionType as CoupActionType]}${message.targetId ? ` contra ${nameOf(message.targetId as string)}` : ''}`);
            break;
          case 'block-declared':
            setPublicState(message.state as PublicState);
            setPendingAction((prev) =>
              prev
                ? { ...prev, stage: 'block', blockerId: message.blockerId as string, blockClaim: message.blockClaim as CoupCharacter, passedIds: [] }
                : prev,
            );
            setSecondsLeft(RESPONSE_WINDOW_SECONDS);
            pushLog(`🛑 ${nameOf(message.blockerId as string)} bloquea reclamando ${CHARACTER_LABEL[message.blockClaim as CoupCharacter]}`);
            break;
          case 'response-passed':
            setPublicState(message.state as PublicState);
            setPendingAction((prev) => (prev ? { ...prev, passedIds: message.passedIds as string[] } : prev));
            break;
          case 'challenge-resolved': {
            setPublicState(message.state as PublicState);
            const truthful = message.claimTruthful as boolean;
            const claimer = message.claimerId as string;
            const challenger = message.challengerId as string;
            pushLog(
              truthful
                ? `✅ ${nameOf(claimer)} sí tenía ${CHARACTER_LABEL[message.claimedCharacter as CoupCharacter]} — ${nameOf(challenger)} pierde una influencia`
                : `❌ ${nameOf(claimer)} mentía sobre ${CHARACTER_LABEL[message.claimedCharacter as CoupCharacter]} — pierde una influencia`,
            );
            setPendingAction(null);
            break;
          }
          case 'action-resolved':
            setPublicState(message.state as PublicState);
            pushLog(
              message.outcome === 'cancelled-by-block'
                ? `🚫 La acción de ${nameOf(message.actorId as string)} queda cancelada por el bloqueo`
                : `▶️ ${ACTION_LABEL[message.actionType as CoupActionType]} de ${nameOf(message.actorId as string)} se aplica`,
            );
            setPendingAction(null);
            if ((message.state as PublicState).phase === 'ended') {
              pushLog(`🏆 ¡${nameOf((message.state as PublicState).winnerId)} gana la partida!`);
            }
            break;
          case 'exchange-resolved':
            setPublicState(message.state as PublicState);
            setExchange(null);
            pushLog(`🔄 ${nameOf(message.playerId as string)} termina su intercambio de Embajador`);
            break;
          case 'error':
            setError(message.message as string);
            break;
        }
      },
    });
    clientRef.current = client;
    client.connect();
    return () => client.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Cuenta atrás puramente visual de la ventana de respuesta — el servidor
  // no impone ningún límite real de tiempo, solo resuelve cuando todos los
  // jugadores conectados y vivos han respondido (ver coupLive.ts).
  useEffect(() => {
    if (!pendingAction) return;
    setSecondsLeft(RESPONSE_WINDOW_SECONDS);
    const interval = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(interval);
  }, [pendingAction?.stage, pendingAction?.actorId, pendingAction?.blockerId]);

  function startGame() {
    clientRef.current?.send({ type: 'start-game' });
  }

  function declareAction(actionType: CoupActionType, targetId?: string) {
    setError('');
    clientRef.current?.send({ type: 'declare-action', actionType, targetId });
  }

  function pass() {
    clientRef.current?.send({ type: 'pass' });
  }

  function challenge() {
    clientRef.current?.send({ type: 'challenge' });
  }

  function block(claimedCharacter: CoupCharacter) {
    clientRef.current?.send({ type: 'block', claimedCharacter });
  }

  function toggleExchangeCard(card: CoupCharacter, index: number) {
    setExchangeSelection((prev) => {
      const key = `${card}-${index}`;
      const has = prev.some((_, i) => `${prev[i]}-${i}` === key);
      if (has) return prev.filter((_, i) => `${prev[i]}-${i}` !== key);
      if (!exchange || prev.length >= exchange.keepCount) return prev;
      return [...prev, card];
    });
  }

  function confirmExchange() {
    if (!exchange) return;
    clientRef.current?.send({ type: 'exchange-select', keep: exchangeSelection });
  }

  if (!publicState || publicState.phase === 'lobby') {
    return (
      <div className="juego-shell">
        <div className="juego-shell-header">
          <Link to="/" className="juego-volver">← Volver</Link>
          <h1>🗡️ Coup — Sala {code}</h1>
        </div>
        <p className="juego-texto-secundario">
          Estado: {status === 'open' ? '🟢 Conectado' : status === 'reconnecting' ? '🟡 Reconectando…' : status === 'connecting' ? '🟡 Conectando…' : '🔴 Desconectado'}
        </p>
        {error && <p className="juego-error">{error}</p>}
        <div className="juego-card-central">
          <h2>Jugadores en la sala</h2>
          <div className="juego-lista-jugadores">
            {players.map((p) => (
              <div key={p.id} className="juego-jugador-row">
                <span>{p.connected ? '🟢' : '🟡'}</span>
                <span>{p.username}{p.isHost ? ' (host)' : ''}</span>
              </div>
            ))}
          </div>
          {me?.isHost && (
            <button className="juego-boton" disabled={players.filter((p) => p.connected).length < 3} onClick={startGame}>
              {players.filter((p) => p.connected).length < 3 ? 'Se necesitan 3-6 jugadores' : 'Empezar partida'}
            </button>
          )}
        </div>
        <RulesButton open={rulesOpen} setOpen={setRulesOpen} />
      </div>
    );
  }

  const myPublic = publicState.players.find((p) => p.playerId === myId);
  const isMyTurn = myId === publicState.turnPlayerId && !pendingAction && !exchange;
  const others = publicState.players.filter((p) => p.playerId !== myId && !p.eliminated);
  const iAmAlive = myPublic && !myPublic.eliminated;
  const mandatoryCoup = (myPublic?.coins ?? 0) >= MANDATORY_COUP_COINS;

  const excludedFromResponse = pendingAction
    ? pendingAction.stage === 'action'
      ? [pendingAction.actorId]
      : [pendingAction.blockerId!]
    : [];
  const canRespond =
    !!pendingAction &&
    !!myId &&
    iAmAlive &&
    !excludedFromResponse.includes(myId) &&
    !pendingAction.passedIds.includes(myId);
  const canBlock =
    !!pendingAction &&
    pendingAction.stage === 'action' &&
    BLOCKABLE_BY[pendingAction.actionType].length > 0 &&
    (!BLOCK_RESTRICTED_TO_TARGET[pendingAction.actionType] || myId === pendingAction.targetId);
  const canChallenge =
    !!pendingAction &&
    (pendingAction.stage === 'block' || (pendingAction.stage === 'action' && !!CHALLENGEABLE[pendingAction.actionType]));

  return (
    <div className="juego-shell">
      <div className="juego-shell-header">
        <Link to="/" className="juego-volver">← Volver</Link>
        <h1>🗡️ Coup — Sala {code}</h1>
      </div>
      <p className="juego-texto-secundario">
        Estado: {status === 'open' ? '🟢 Conectado' : status === 'reconnecting' ? '🟡 Reconectando…' : status === 'connecting' ? '🟡 Conectando…' : '🔴 Desconectado'}
      </p>
      {error && <p className="juego-error">{error}</p>}

      {publicState.phase === 'ended' ? (
        <div className="juego-card-central">
          <h2>🏆 ¡Fin de la partida!</h2>
          <p>Gana <strong>{nameOf(publicState.winnerId)}</strong></p>
        </div>
      ) : (
        <>
          <div className="juego-card-central">
            <h3>Mi mano {myPublic ? `— 💰 ${myPublic.coins} monedas` : ''}</h3>
            {iAmAlive ? (
              <div style={{ display: 'flex', gap: 10 }}>
                {(myHand ?? []).map((c, i) => (
                  <span key={`${c}-${i}`} className="juego-boton-secundario">{CHARACTER_LABEL[c]}</span>
                ))}
              </div>
            ) : (
              <p className="juego-texto-secundario">Has sido eliminado/a — sigue viendo la partida</p>
            )}

            {isMyTurn && iAmAlive && (
              <div style={{ width: '100%', textAlign: 'left' }}>
                <p className="juego-texto-secundario">Tu turno — elige una acción{mandatoryCoup ? ' (10+ monedas: Golpe de estado obligatorio)' : ''}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button className="juego-boton-secundario" disabled={mandatoryCoup} onClick={() => declareAction('ingresos')}>{ACTION_LABEL.ingresos}</button>
                  <button className="juego-boton-secundario" disabled={mandatoryCoup} onClick={() => declareAction('ayuda-externa')}>{ACTION_LABEL['ayuda-externa']}</button>
                  <button className="juego-boton-secundario" disabled={mandatoryCoup} onClick={() => declareAction('duque')}>{ACTION_LABEL.duque}</button>
                  <button className="juego-boton-secundario" disabled={mandatoryCoup} onClick={() => declareAction('embajador')}>{ACTION_LABEL.embajador}</button>
                </div>
                {others.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <select className="juego-input" value={selectedTarget} onChange={(e) => setSelectedTarget(e.target.value)}>
                      <option value="">— Elegir objetivo —</option>
                      {others.map((p) => (
                        <option key={p.playerId} value={p.playerId}>{p.username} ({p.coins}🪙)</option>
                      ))}
                    </select>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button className="juego-boton" disabled={!selectedTarget || (mandatoryCoup ? false : (myPublic?.coins ?? 0) < 7)} onClick={() => declareAction('golpe-estado', selectedTarget)}>{ACTION_LABEL['golpe-estado']}</button>
                      <button className="juego-boton-secundario" disabled={!selectedTarget || mandatoryCoup || (myPublic?.coins ?? 0) < 3} onClick={() => declareAction('asesino', selectedTarget)}>{ACTION_LABEL.asesino}</button>
                      <button className="juego-boton-secundario" disabled={!selectedTarget || mandatoryCoup} onClick={() => declareAction('capitan', selectedTarget)}>{ACTION_LABEL.capitan}</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!isMyTurn && !pendingAction && !exchange && iAmAlive && (
              <p className="juego-texto-secundario">Turno de {nameOf(publicState.turnPlayerId)}…</p>
            )}

            {pendingAction && (
              <div style={{ width: '100%', textAlign: 'left' }}>
                <p className="juego-texto-secundario">
                  {pendingAction.stage === 'action'
                    ? `${nameOf(pendingAction.actorId)} declara ${ACTION_LABEL[pendingAction.actionType]}${pendingAction.targetId ? ` contra ${nameOf(pendingAction.targetId)}` : ''}`
                    : `${nameOf(pendingAction.blockerId)} bloquea reclamando ${CHARACTER_LABEL[pendingAction.blockClaim!]}`}
                  {' '}⏱️ {secondsLeft}s
                </p>
                {canRespond ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="juego-boton-secundario" onClick={pass}>Pasar</button>
                    {canChallenge && <button className="juego-boton-secundario" onClick={challenge}>Desafiar</button>}
                    {canBlock &&
                      BLOCKABLE_BY[pendingAction.actionType].map((character) => (
                        <button key={character} className="juego-boton-secundario" onClick={() => block(character)}>
                          Bloquear ({CHARACTER_LABEL[character]})
                        </button>
                      ))}
                  </div>
                ) : (
                  <p className="juego-texto-secundario">Esperando respuesta de los demás jugadores…</p>
                )}
              </div>
            )}

            {exchange && exchange.options.length > 0 && myId === publicState.turnPlayerId && (
              <div style={{ width: '100%', textAlign: 'left' }}>
                <p className="juego-texto-secundario">Elige {exchange.keepCount} carta(s) para conservar:</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {exchange.options.map((c, i) => {
                    const key = `${c}-${i}`;
                    const selectedIndex = exchangeSelection.findIndex((_, si) => `${exchangeSelection[si]}-${si}` === key);
                    return (
                      <button
                        key={key}
                        className={selectedIndex >= 0 ? 'juego-boton' : 'juego-boton-secundario'}
                        onClick={() => toggleExchangeCard(c, i)}
                      >
                        {CHARACTER_LABEL[c]}
                      </button>
                    );
                  })}
                </div>
                <button className="juego-boton" disabled={exchangeSelection.length !== exchange.keepCount} style={{ marginTop: 8 }} onClick={confirmExchange}>
                  Confirmar selección
                </button>
              </div>
            )}
            {exchange && myId !== publicState.turnPlayerId && (
              <p className="juego-texto-secundario">{nameOf(publicState.turnPlayerId)} está intercambiando cartas con el Embajador…</p>
            )}
          </div>

          <div className="juego-card-central">
            <h3>Mesa</h3>
            <div className="juego-lista-jugadores">
              {publicState.players.map((p) => (
                <div key={p.playerId} className="juego-jugador-row">
                  <span>{p.playerId === publicState.turnPlayerId ? '👉' : p.eliminated ? '☠️' : '🙂'}</span>
                  <span>{p.username}{p.eliminated ? ' (eliminado)' : ''}</span>
                  <span>💰{p.coins}</span>
                  <span>🂠×{p.influenceCount}</span>
                  {p.revealed.length > 0 && <span>({p.revealed.map((c) => CHARACTER_LABEL[c]).join(', ')})</span>}
                </div>
              ))}
            </div>
            <p className="juego-texto-secundario">Mazo: {publicState.deckCount} cartas</p>
          </div>
        </>
      )}

      {log.length > 0 && (
        <div className="juego-card-central" style={{ textAlign: 'left', alignItems: 'flex-start' }}>
          <h3>Registro</h3>
          {log.map((entry, i) => (
            <p key={i} className="juego-texto-secundario">{entry}</p>
          ))}
        </div>
      )}

      <RulesButton open={rulesOpen} setOpen={setRulesOpen} />
    </div>
  );
}

/**
 * Botón "?" siempre alcanzable (fixed) que abre la referencia de reglas de
 * Coup: acción de cada personaje y quién puede bloquearla — per design.md
 * "Coup gets an in-app rules reference reachable mid-game" y la petición
 * explícita del propietario de que nadie tenga que recordar el reglamento
 * completo.
 */
function RulesButton({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  return (
    <>
      <button
        className="juego-boton"
        style={{ position: 'fixed', bottom: 20, right: 20, borderRadius: '50%', width: 52, height: 52, fontSize: 22, zIndex: 10 }}
        onClick={() => setOpen(true)}
        aria-label="Referencia de reglas"
      >
        ?
      </button>
      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setOpen(false)}
        >
          <div className="juego-card-central" style={{ maxWidth: 480, textAlign: 'left', alignItems: 'flex-start', maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2>📖 Reglas de Coup</h2>
            <p className="juego-texto-secundario"><strong>Ingresos</strong>: +1 moneda. No se puede bloquear ni desafiar.</p>
            <p className="juego-texto-secundario"><strong>Ayuda externa</strong>: +2 monedas. Bloqueable por cualquiera reclamando Duque. No se puede desafiar (no reclama personaje).</p>
            <p className="juego-texto-secundario"><strong>Golpe de estado</strong>: paga 7, el objetivo pierde 1 influencia. No se puede bloquear ni desafiar. Obligatorio si tienes 10+ monedas.</p>
            <p className="juego-texto-secundario"><strong>👑 Duque</strong>: +3 monedas. No se puede bloquear.</p>
            <p className="juego-texto-secundario"><strong>🗡️ Asesino</strong>: paga 3, el objetivo pierde 1 influencia. Solo el objetivo puede bloquearlo reclamando Condesa.</p>
            <p className="juego-texto-secundario"><strong>⚓ Capitán</strong>: roba 2 monedas a un objetivo. Solo el objetivo puede bloquearlo reclamando Capitán o Embajador.</p>
            <p className="juego-texto-secundario"><strong>🕊️ Embajador</strong>: intercambia 0-2 de tus cartas con el mazo. No se puede bloquear.</p>
            <p className="juego-texto-secundario"><strong>🛡️ Condesa</strong>: no tiene acción propia, solo sirve para bloquear el Asesinato.</p>
            <p className="juego-texto-secundario">Cualquier reclamo de personaje puede desafiarse: si mentía, pierde una influencia y la acción/bloqueo no tiene efecto; si decía la verdad, quien desafió pierde una influencia y la carta se baraja y se reparte una nueva al reclamante.</p>
            <button className="juego-boton" onClick={() => setOpen(false)}>Cerrar</button>
          </div>
        </div>
      )}
    </>
  );
}
