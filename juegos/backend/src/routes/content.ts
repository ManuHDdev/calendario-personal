import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireAuthenticated } from '../middleware/auth';
import { contentBanks, TriviaQuestion } from '../content/loader';
import { createShuffleBag, ShuffleBag } from '../services/shuffleBag';

// ─────────────────────────────────────────────────────────────────────────
// Pass-and-play content API (ver spec.md "Pass-and-play content banks" y
// design.md "Content volume and no-repeat guarantee"). El backend no
// persiste nada de la partida — el único estado es la bolsa de barajado
// (shuffle-bag) de cada sesión de pass-and-play, identificada por un
// `sessionId` que genera el propio cliente (una vez por sentada de juego) y
// que vive únicamente en memoria del proceso, igual que RoomState.
// ─────────────────────────────────────────────────────────────────────────

interface PassAndPlaySession {
  impostorBags: Map<string, ShuffleBag<{ palabra: string; categoria: string }>>;
  yoNuncaBag: ShuffleBag<string>;
  verdadBag: ShuffleBag<string>;
  retoBag: ShuffleBag<string>;
  lastUsed: number;
}

const sessions = new Map<string, PassAndPlaySession>();
const SESSION_IDLE_MS = 6 * 60 * 60 * 1000; // 6h — una sentada de juego dura ~4h (ver design.md)

function cleanupIdleSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastUsed > SESSION_IDLE_MS) sessions.delete(id);
  }
}

function getOrCreateSession(sessionId: string): PassAndPlaySession {
  cleanupIdleSessions();
  let session = sessions.get(sessionId);
  if (!session) {
    const verdadPool = contentBanks.verdadORetoPrompts.filter((p) => p.tipo === 'verdad').map((p) => p.texto);
    const retoPool = contentBanks.verdadORetoPrompts.filter((p) => p.tipo === 'reto').map((p) => p.texto);
    session = {
      impostorBags: new Map(),
      yoNuncaBag: createShuffleBag(contentBanks.yoNuncaPrompts),
      verdadBag: createShuffleBag(verdadPool),
      retoBag: createShuffleBag(retoPool),
      lastUsed: Date.now(),
    };
    sessions.set(sessionId, session);
  }
  session.lastUsed = Date.now();
  return session;
}

function getImpostorBag(session: PassAndPlaySession, categoria: string | undefined) {
  const key = categoria ?? '__todas__';
  let bag = session.impostorBags.get(key);
  if (!bag) {
    const pool = categoria
      ? contentBanks.impostorWords.filter((w) => w.categoria === categoria)
      : contentBanks.impostorWords;
    if (pool.length === 0) return null;
    bag = createShuffleBag(pool);
    session.impostorBags.set(key, bag);
  }
  return bag;
}

function getSessionId(request: FastifyRequest): string {
  const query = request.query as Record<string, string | undefined>;
  // Sin sessionId el cliente no puede garantizar "no repite en la sesión" —
  // degradamos a una sesión anónima efímera (una bolsa nueva por request)
  // en vez de fallar, para no romper un cliente que aún no la implemente.
  return query.sessionId ?? `anon-${Math.random().toString(36).slice(2)}`;
}

export async function contentRoutes(app: FastifyInstance): Promise<void> {
  // GET /juegos/api/impostor/word?categoria=&sessionId=
  app.get<{ Querystring: { categoria?: string; sessionId?: string } }>(
    '/juegos/api/impostor/word',
    { preHandler: requireAuthenticated },
    async (request, reply: FastifyReply) => {
      const { categoria } = request.query;
      const session = getOrCreateSession(getSessionId(request));
      const bag = getImpostorBag(session, categoria);
      if (!bag) {
        return reply.code(400).send({ error: 'Bad Request', message: `Categoría desconocida: ${categoria}` });
      }
      const { palabra, categoria: categoriaResuelta } = bag.draw();
      return reply.send({ word: palabra, category: categoriaResuelta });
    },
  );

  // GET /juegos/api/yo-nunca/prompt?sessionId=
  app.get<{ Querystring: { sessionId?: string } }>(
    '/juegos/api/yo-nunca/prompt',
    { preHandler: requireAuthenticated },
    async (request, reply: FastifyReply) => {
      const session = getOrCreateSession(getSessionId(request));
      const prompt = session.yoNuncaBag.draw();
      return reply.send({ prompt });
    },
  );

  // GET /juegos/api/verdad-o-reto/prompt?tipo=verdad|reto&sessionId=
  app.get<{ Querystring: { tipo?: string; sessionId?: string } }>(
    '/juegos/api/verdad-o-reto/prompt',
    { preHandler: requireAuthenticated },
    async (request, reply: FastifyReply) => {
      const { tipo } = request.query;
      if (tipo !== 'verdad' && tipo !== 'reto') {
        return reply.code(400).send({ error: 'Bad Request', message: "tipo debe ser 'verdad' o 'reto'" });
      }
      const session = getOrCreateSession(getSessionId(request));
      const bag = tipo === 'verdad' ? session.verdadBag : session.retoBag;
      const prompt = bag.draw();
      return reply.send({ prompt, tipo });
    },
  );
}

export function drawTriviaQuestion(bag: ShuffleBag<TriviaQuestion>): TriviaQuestion {
  return bag.draw();
}

// Exportado solo para tests (limpiar estado entre pruebas).
export function __resetSessionsForTests(): void {
  sessions.clear();
}
