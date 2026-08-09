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

/** Ver design.md "`dureza` replaces `categoria` as the single axis; 'Mezcla'
 * combines all three" — mismo mecanismo que getImpostorBag, aplicado a Yo
 * Nunca (bolsa keyed por `${dureza ?? 'mezcla'}:${sinPareja ? 'con_sin_pareja' : 'estandar_solo'}`).
 * El toggle "Modo SIN PAREJA" es aditivo (superset), no un swap de contenido —
 * mismo principio que ya tenía Verdad o Reto, ahora aplicado también aquí. */
function getYoNuncaBag(session: PassAndPlaySession, dureza: string | undefined, sinPareja: boolean) {
  const key = `${dureza ?? '__mezcla__'}:${sinPareja ? 'con_sin_pareja' : 'estandar_solo'}`;
  let bag = session.yoNuncaBags.get(key);
  if (!bag) {
    const niveles = sinPareja ? ['estandar', 'sin_pareja'] : ['estandar'];
    const pool = contentBanks.yoNuncaPrompts
      .filter((p) => !dureza || p.dureza === dureza)
      .filter((p) => niveles.includes(p.nivel))
      .map((p) => p.texto);
    if (pool.length === 0) return null;
    bag = createShuffleBag(pool);
    session.yoNuncaBags.set(key, bag);
  }
  return bag;
}

/** Verdad o Reto: bolsa keyed por `${tipo}:${dureza ?? 'mezcla'}:${sinPareja ? 'con_sin_pareja' : 'estandar_solo'}`
 * — el toggle "Modo SIN PAREJA" es aditivo (superset), no un swap de contenido
 * (design.md "Modo SIN PAREJA extended to Yo Nunca"). */
function getVerdadORetoBag(
  session: PassAndPlaySession,
  tipo: 'verdad' | 'reto',
  dureza: string | undefined,
  sinPareja: boolean,
) {
  const key = `${tipo}:${dureza ?? '__mezcla__'}:${sinPareja ? 'con_sin_pareja' : 'estandar_solo'}`;
  let bag = session.verdadORetoBags.get(key);
  if (!bag) {
    const niveles = sinPareja ? ['estandar', 'sin_pareja'] : ['estandar'];
    const pool = contentBanks.verdadORetoPrompts
      .filter((p) => p.tipo === tipo)
      .filter((p) => !dureza || p.dureza === dureza)
      .filter((p) => niveles.includes(p.nivel))
      .map((p) => p.texto);
    if (pool.length === 0) return null;
    bag = createShuffleBag(pool);
    session.verdadORetoBags.set(key, bag);
  }
  return bag;
}

/** `dureza=mezcla` (o ausente) significa "sin filtro" — el pool combinado de
 * los tres niveles. `categoria=todas` sigue el mismo patrón para El Impostor,
 * que no forma parte de este cambio. */
function normalizeCategoria(categoria: string | undefined): string | undefined {
  return !categoria || categoria === 'todas' ? undefined : categoria;
}

/** Igual que `normalizeCategoria` pero para el axis `dureza` de Yo Nunca y
 * Verdad o Reto (ver design.md "Mezcla combines all three"). */
function normalizeDureza(dureza: string | undefined): string | undefined {
  return !dureza || dureza === 'mezcla' ? undefined : dureza;
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

  // GET /juegos/api/yo-nunca/prompt?dureza=&sinPareja=true|false&sessionId=
  app.get<{ Querystring: { dureza?: string; sinPareja?: string; sessionId?: string } }>(
    '/juegos/api/yo-nunca/prompt',
    { preHandler: requireAuthenticated },
    async (request, reply: FastifyReply) => {
      const dureza = normalizeDureza(request.query.dureza);
      const sinPareja = request.query.sinPareja === 'true';
      const session = getOrCreateSession(getSessionId(request));
      const bag = getYoNuncaBag(session, dureza, sinPareja);
      if (!bag) {
        return reply.code(400).send({ error: 'Bad Request', message: `Dureza desconocida: ${dureza}` });
      }
      const prompt = bag.draw();
      return reply.send({ prompt });
    },
  );

  // GET /juegos/api/verdad-o-reto/prompt?tipo=verdad|reto&dureza=&sinPareja=true|false&sessionId=
  app.get<{ Querystring: { tipo?: string; dureza?: string; sinPareja?: string; sessionId?: string } }>(
    '/juegos/api/verdad-o-reto/prompt',
    { preHandler: requireAuthenticated },
    async (request, reply: FastifyReply) => {
      const { tipo } = request.query;
      if (tipo !== 'verdad' && tipo !== 'reto') {
        return reply.code(400).send({ error: 'Bad Request', message: "tipo debe ser 'verdad' o 'reto'" });
      }
      const dureza = normalizeDureza(request.query.dureza);
      const sinPareja = request.query.sinPareja === 'true';
      const session = getOrCreateSession(getSessionId(request));
      const bag = getVerdadORetoBag(session, tipo, dureza, sinPareja);
      if (!bag) {
        return reply.code(400).send({ error: 'Bad Request', message: `Dureza desconocida: ${dureza}` });
      }
      const prompt = bag.draw();
      return reply.send({ prompt, tipo });
    },
  );

  // GET /juegos/api/tabu/cartas?categoria= — devuelve un lote barajado de
  // cartas (no un shuffle-bag por sesión: Tabú/Mímica son team play en un
  // solo dispositivo compartido, sin concepto de sesión de servidor — ver
  // design.md "Tabú and Mímica share one client-side 'team turn' module").
  app.get<{ Querystring: { categoria?: string } }>(
    '/juegos/api/tabu/cartas',
    { preHandler: requireAuthenticated },
    async (request, reply: FastifyReply) => {
      const categoria = normalizeCategoria(request.query.categoria);
      const pool = categoria
        ? contentBanks.tabuCartas.filter((c) => c.categoria === categoria)
        : contentBanks.tabuCartas;
      if (pool.length === 0) {
        return reply.code(400).send({ error: 'Bad Request', message: `Categoría desconocida: ${categoria}` });
      }
      return reply.send({ cartas: shuffleBatch(pool) });
    },
  );

  // GET /juegos/api/mimica/cartas?categoria=
  app.get<{ Querystring: { categoria?: string } }>(
    '/juegos/api/mimica/cartas',
    { preHandler: requireAuthenticated },
    async (request, reply: FastifyReply) => {
      const categoria = normalizeCategoria(request.query.categoria);
      const pool = categoria
        ? contentBanks.mimicaItems.filter((i) => i.categoria === categoria)
        : contentBanks.mimicaItems;
      if (pool.length === 0) {
        return reply.code(400).send({ error: 'Bad Request', message: `Categoría desconocida: ${categoria}` });
      }
      return reply.send({ items: shuffleBatch(pool) });
    },
  );
}

/** Baraja un array sin mutar el original (Fisher–Yates) — usado por los
 * endpoints de Tabú/Mímica, que devuelven un lote ya barajado en vez de un
 * shuffle-bag por sesión (ver design.md "Tabú and Mímica share one
 * client-side 'team turn' module": no hay concepto de sesión de servidor más
 * allá de la propia partida local). */
function shuffleBatch<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function drawTriviaQuestion(bag: ShuffleBag<TriviaQuestion>): TriviaQuestion {
  return bag.draw();
}

// Exportado solo para tests (limpiar estado entre pruebas).
export function __resetSessionsForTests(): void {
  sessions.clear();
}
