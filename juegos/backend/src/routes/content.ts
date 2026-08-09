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
  yoNuncaBags: Map<string, ShuffleBag<string>>;
  verdadORetoBags: Map<string, ShuffleBag<string>>;
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
    session = {
      impostorBags: new Map(),
      yoNuncaBags: new Map(),
      verdadORetoBags: new Map(),
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

/** Ver design.md "Yo Nunca / Verdad o Reto: categories via the existing
 * per-category shuffle-bag pattern" — mismo mecanismo que getImpostorBag,
 * aplicado a Yo Nunca (bolsa keyed por categoría, o 'todas' para el pool
 * combinado). */
function getYoNuncaBag(session: PassAndPlaySession, categoria: string | undefined) {
  const key = categoria ?? '__todas__';
  let bag = session.yoNuncaBags.get(key);
  if (!bag) {
    const pool = categoria
      ? contentBanks.yoNuncaPrompts.filter((p) => p.categoria === categoria).map((p) => p.texto)
      : contentBanks.yoNuncaPrompts.map((p) => p.texto);
    if (pool.length === 0) return null;
    bag = createShuffleBag(pool);
    session.yoNuncaBags.set(key, bag);
  }
  return bag;
}

/** Verdad o Reto: bolsa keyed por `${tipo}:${categoria ?? 'todas'}:${sinPareja ? 'con_sin_pareja' : 'estandar_solo'}`
 * — el toggle "Modo SIN PAREJA" es aditivo (superset), no un swap de contenido
 * (design.md "Verdad o Reto's extra axis — nivel"). */
function getVerdadORetoBag(
  session: PassAndPlaySession,
  tipo: 'verdad' | 'reto',
  categoria: string | undefined,
  sinPareja: boolean,
) {
  const key = `${tipo}:${categoria ?? '__todas__'}:${sinPareja ? 'con_sin_pareja' : 'estandar_solo'}`;
  let bag = session.verdadORetoBags.get(key);
  if (!bag) {
    const niveles = sinPareja ? ['estandar', 'sin_pareja'] : ['estandar'];
    const pool = contentBanks.verdadORetoPrompts
      .filter((p) => p.tipo === tipo)
      .filter((p) => !categoria || p.categoria === categoria)
      .filter((p) => niveles.includes(p.nivel))
      .map((p) => p.texto);
    if (pool.length === 0) return null;
    bag = createShuffleBag(pool);
    session.verdadORetoBags.set(key, bag);
  }
  return bag;
}

/** `categoria=todas` (o ausente) significa "sin filtro" — el pool combinado. */
function normalizeCategoria(categoria: string | undefined): string | undefined {
  return !categoria || categoria === 'todas' ? undefined : categoria;
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
      const categoria = normalizeCategoria(request.query.categoria);
      const session = getOrCreateSession(getSessionId(request));
      const bag = getImpostorBag(session, categoria);
      if (!bag) {
        return reply.code(400).send({ error: 'Bad Request', message: `Categoría desconocida: ${categoria}` });
      }
      const { palabra, categoria: categoriaResuelta } = bag.draw();
      return reply.send({ word: palabra, category: categoriaResuelta });
    },
  );

  // GET /juegos/api/yo-nunca/prompt?categoria=&sessionId=
  app.get<{ Querystring: { categoria?: string; sessionId?: string } }>(
    '/juegos/api/yo-nunca/prompt',
    { preHandler: requireAuthenticated },
    async (request, reply: FastifyReply) => {
      const categoria = normalizeCategoria(request.query.categoria);
      const session = getOrCreateSession(getSessionId(request));
      const bag = getYoNuncaBag(session, categoria);
      if (!bag) {
        return reply.code(400).send({ error: 'Bad Request', message: `Categoría desconocida: ${categoria}` });
      }
      const prompt = bag.draw();
      return reply.send({ prompt });
    },
  );

  // GET /juegos/api/verdad-o-reto/prompt?tipo=verdad|reto&categoria=&sinPareja=true|false&sessionId=
  app.get<{ Querystring: { tipo?: string; categoria?: string; sinPareja?: string; sessionId?: string } }>(
    '/juegos/api/verdad-o-reto/prompt',
    { preHandler: requireAuthenticated },
    async (request, reply: FastifyReply) => {
      const { tipo } = request.query;
      if (tipo !== 'verdad' && tipo !== 'reto') {
        return reply.code(400).send({ error: 'Bad Request', message: "tipo debe ser 'verdad' o 'reto'" });
      }
      const categoria = normalizeCategoria(request.query.categoria);
      const sinPareja = request.query.sinPareja === 'true';
      const session = getOrCreateSession(getSessionId(request));
      const bag = getVerdadORetoBag(session, tipo, categoria, sinPareja);
      if (!bag) {
        return reply.code(400).send({ error: 'Bad Request', message: `Categoría desconocida: ${categoria}` });
      }
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
