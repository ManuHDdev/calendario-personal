// Lógica de dominio de El Impostor, compartida entre el modo pass-and-play
// (llamada desde el frontend, sin estado en el servidor) y el modo en vivo
// (llamada desde rooms/impostorLive.ts dentro de un RoomState). Ver
// design.md, "Shared domain logic between pass-and-play and live Impostor".

export interface ImpostorRole {
  playerId: string;
  isImpostor: boolean;
  /** El impostor NUNCA recibe la palabra — ver spec.md "Impostor en vivo role assignment". */
  word: string | null;
}

export interface ImpostorRound {
  word: string;
  categoria: string;
  impostorId: string;
  roles: ImpostorRole[];
  votes: Record<string, string>; // playerId -> votedForId
}

export function assignRoles(
  playerIds: string[],
  word: string,
): { impostorId: string; roles: ImpostorRole[] } {
  if (playerIds.length < 3) {
    throw new Error('assignRoles: se necesitan al menos 3 jugadores para El Impostor');
  }
  const impostorIndex = Math.floor(Math.random() * playerIds.length);
  const impostorId = playerIds[impostorIndex];

  const roles: ImpostorRole[] = playerIds.map((playerId) => ({
    playerId,
    isImpostor: playerId === impostorId,
    word: playerId === impostorId ? null : word,
  }));

  return { impostorId, roles };
}

export function startRound(
  playerIds: string[],
  word: string,
  categoria: string,
): ImpostorRound {
  const { impostorId, roles } = assignRoles(playerIds, word);
  return { word, categoria, impostorId, roles, votes: {} };
}

/** Devuelve el rol correspondiente a un jugador concreto (para entrega privada por socket). */
export function revealRoles(round: ImpostorRound): ImpostorRole[] {
  return round.roles;
}

export function recordVote(
  round: ImpostorRound,
  playerId: string,
  votedForId: string,
): ImpostorRound {
  return { ...round, votes: { ...round.votes, [playerId]: votedForId } };
}

export interface VoteTally {
  counts: Record<string, number>;
  mostVotedId: string | null;
  wasImpostorCaught: boolean;
}

export function tallyVotes(round: ImpostorRound): VoteTally {
  const counts: Record<string, number> = {};
  for (const votedForId of Object.values(round.votes)) {
    counts[votedForId] = (counts[votedForId] ?? 0) + 1;
  }

  let mostVotedId: string | null = null;
  let maxVotes = 0;
  let tie = false;
  for (const [playerId, count] of Object.entries(counts)) {
    if (count > maxVotes) {
      maxVotes = count;
      mostVotedId = playerId;
      tie = false;
    } else if (count === maxVotes && maxVotes > 0) {
      tie = true;
    }
  }
  if (tie) mostVotedId = null;

  return {
    counts,
    mostVotedId,
    wasImpostorCaught: mostVotedId !== null && mostVotedId === round.impostorId,
  };
}
