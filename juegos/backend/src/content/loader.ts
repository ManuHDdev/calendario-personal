import { z } from 'zod';
import impostorWordsRaw from './impostor-words.json';
import triviaQuestionsRaw from './trivia-questions.json';
import yoNuncaRaw from './yo-nunca.json';
import verdadORetoRaw from './verdad-o-reto.json';
import bombPartySilabasRaw from './bomb-party-silabas.json';
import bombPartyCategoriasRaw from './bomb-party-categorias.json';
import quienEsMasProbableRaw from './quien-es-mas-probable.json';
import diezDeDiezCualidadesRaw from './diez-de-diez-cualidades.json';
import diezDeDiezPerosRaw from './diez-de-diez-peros.json';
import tabuCartasRaw from './tabu-cartas.json';
import mimicaCartasRaw from './mimica-cartas.json';

// ─────────────────────────────────────────────────────────────────────────
// Carga y valida los cuatro bancos de contenido estático al arrancar el
// proceso (ver design.md: "Content banks ... loaded into memory at boot").
// Falla rápido (throw) si algún fichero está corrupto/mal formado o no
// alcanza el volumen mínimo exigido por specs/juegos/spec.md.
// ─────────────────────────────────────────────────────────────────────────

export interface ImpostorWord {
  palabra: string;
  categoria: string;
}

export interface TriviaQuestion {
  categoria: string;
  pregunta: string;
  opciones: string[];
  correcta: string;
}

export type VerdadORetoTipo = 'verdad' | 'reto';
export type Dureza = 'suave' | 'media' | 'fuerte';
export type Nivel = 'estandar' | 'sin_pareja';

export interface YoNuncaPrompt {
  texto: string;
  dureza: Dureza;
  nivel: Nivel;
}

export interface VerdadORetoPrompt {
  texto: string;
  tipo: VerdadORetoTipo;
  dureza: Dureza;
  nivel: Nivel;
}

// ── Batch A (add-nine-party-games): Bomb Party, ¿Quién es más probable?, 10/10 ──

/** Dureza propia de ¿Quién es más probable? — no reutiliza el `Dureza` de
 * Yo Nunca/Verdad o Reto (`suave/media/fuerte`), ver design.md. */
export type QuienEsMasProbableDureza = 'familiar' | 'fiesta' | 'subido_de_tono';

export interface QuienEsMasProbablePrompt {
  texto: string;
  dureza: QuienEsMasProbableDureza;
}

/** Intensidad propia de 10/10 — solo dos niveles, sin "mezcla" (design.md
 * "10/10: ... both drawn from the same selected intensity"). */
export type DiezDeDiezIntensidad = 'suave' | 'picante';

export interface DiezDeDiezItem {
  texto: string;
  intensidad: DiezDeDiezIntensidad;
}

// Tabú y Mímica: team play en un único dispositivo compartido (ver
// design.md "Decisions — team play, shared device"). No necesitan un
// shuffle-bag por sesión como el resto de bancos: content.ts sirve un lote
// ya barajado (ver "content.ts").
export interface TabuCarta {
  palabra: string;
  prohibidas: string[];
  categoria: string;
}

export interface MimicaItem {
  texto: string;
  categoria: string;
}

const impostorWordSchema = z.object({
  palabra: z.string().min(1),
  categoria: z.string().min(1),
});
const impostorBankSchema = z.object({ words: z.array(impostorWordSchema) });

const triviaQuestionSchema = z.object({
  categoria: z.string().min(1),
  pregunta: z.string().min(1),
  opciones: z.array(z.string().min(1)).length(4),
  correcta: z.string().min(1),
}).refine((q) => q.opciones.includes(q.correcta), {
  message: 'correcta debe ser una de las opciones',
});
const triviaBankSchema = z.object({ questions: z.array(triviaQuestionSchema) });

const durezaEnum = z.enum(['suave', 'media', 'fuerte']);
const nivelEnum = z.enum(['estandar', 'sin_pareja']);

const yoNuncaPromptSchema = z.object({
  texto: z.string().min(1),
  dureza: durezaEnum,
  nivel: nivelEnum,
});
const yoNuncaBankSchema = z.object({ prompts: z.array(yoNuncaPromptSchema) });

const verdadORetoPromptSchema = z.object({
  texto: z.string().min(1),
  tipo: z.enum(['verdad', 'reto']),
  dureza: durezaEnum,
  nivel: nivelEnum,
});
const verdadORetoBankSchema = z.object({ prompts: z.array(verdadORetoPromptSchema) });

const bombPartySilabaSchema = z.string().min(1);
const bombPartySilabasBankSchema = z.object({ silabas: z.array(bombPartySilabaSchema) });

const bombPartyCategoriaSchema = z.string().min(1);
const bombPartyCategoriasBankSchema = z.object({ categorias: z.array(bombPartyCategoriaSchema) });

const quienEsMasProbableDurezaEnum = z.enum(['familiar', 'fiesta', 'subido_de_tono']);
const quienEsMasProbablePromptSchema = z.object({
  texto: z.string().min(1),
  dureza: quienEsMasProbableDurezaEnum,
});
const quienEsMasProbableBankSchema = z.object({ prompts: z.array(quienEsMasProbablePromptSchema) });

const diezDeDiezIntensidadEnum = z.enum(['suave', 'picante']);
const diezDeDiezItemSchema = z.object({
  texto: z.string().min(1),
  intensidad: diezDeDiezIntensidadEnum,
});
const diezDeDiezCualidadesBankSchema = z.object({ cualidades: z.array(diezDeDiezItemSchema) });
const diezDeDiezPerosBankSchema = z.object({ peros: z.array(diezDeDiezItemSchema) });

// Tabú exige exactamente 4 o 5 palabras prohibidas por carta (ver
// specs/juegos/spec.md "Tabú team turns").
const tabuCartaSchema = z.object({
  palabra: z.string().min(1),
  prohibidas: z.array(z.string().min(1)).min(4).max(5),
  categoria: z.string().min(1),
});
const tabuBankSchema = z.object({ cartas: z.array(tabuCartaSchema) });

const mimicaItemSchema = z.object({
  texto: z.string().min(1),
  categoria: z.string().min(1),
});
const mimicaBankSchema = z.object({ items: z.array(mimicaItemSchema) });

const MIN_IMPOSTOR_WORDS = 300;
const MIN_TRIVIA_QUESTIONS = 500;
const MIN_YO_NUNCA_PROMPTS = 180;
const MIN_YO_NUNCA_PER_BUCKET = 30;
const MIN_VERDAD_O_RETO_PROMPTS = 180;
const MIN_VERDAD_O_RETO_PER_BUCKET = 15;
const MIN_TABU_CARTAS = 80;
const MIN_MIMICA_ITEMS = 80;
const DUREZAS: Dureza[] = ['suave', 'media', 'fuerte'];
const TIPOS: VerdadORetoTipo[] = ['verdad', 'reto'];
const NIVELES: Nivel[] = ['estandar', 'sin_pareja'];

const MIN_BOMB_PARTY_SILABAS = 60;
const MIN_BOMB_PARTY_CATEGORIAS = 20;
const MIN_QUIEN_ES_MAS_PROBABLE_PROMPTS = 90;
const MIN_QUIEN_ES_MAS_PROBABLE_PER_DUREZA = 30;
const QUIEN_ES_MAS_PROBABLE_DUREZAS: QuienEsMasProbableDureza[] = ['familiar', 'fiesta', 'subido_de_tono'];
const MIN_DIEZ_DE_DIEZ_ITEMS = 60;
const MIN_DIEZ_DE_DIEZ_PER_INTENSIDAD = 30;
const DIEZ_DE_DIEZ_INTENSIDADES: DiezDeDiezIntensidad[] = ['suave', 'picante'];

export interface ContentBanks {
  impostorWords: ImpostorWord[];
  triviaQuestions: TriviaQuestion[];
  triviaCategories: string[];
  yoNuncaPrompts: YoNuncaPrompt[];
  verdadORetoPrompts: VerdadORetoPrompt[];
  bombPartySilabas: string[];
  bombPartyCategorias: string[];
  quienEsMasProbablePrompts: QuienEsMasProbablePrompt[];
  diezDeDiezCualidades: DiezDeDiezItem[];
  diezDeDiezPeros: DiezDeDiezItem[];
  tabuCartas: TabuCarta[];
  tabuCategories: string[];
  mimicaItems: MimicaItem[];
  mimicaCategories: string[];
}

export function loadContentBanks(): ContentBanks {
  const impostor = impostorBankSchema.parse(impostorWordsRaw);
  if (impostor.words.length < MIN_IMPOSTOR_WORDS) {
    throw new Error(
      `impostor-words.json: se requieren al menos ${MIN_IMPOSTOR_WORDS} palabras, hay ${impostor.words.length}`,
    );
  }

  const trivia = triviaBankSchema.parse(triviaQuestionsRaw);
  if (trivia.questions.length < MIN_TRIVIA_QUESTIONS) {
    throw new Error(
      `trivia-questions.json: se requieren al menos ${MIN_TRIVIA_QUESTIONS} preguntas, hay ${trivia.questions.length}`,
    );
  }

  const yoNunca = yoNuncaBankSchema.parse(yoNuncaRaw);
  if (yoNunca.prompts.length < MIN_YO_NUNCA_PROMPTS) {
    throw new Error(
      `yo-nunca.json: se requieren al menos ${MIN_YO_NUNCA_PROMPTS} prompts, hay ${yoNunca.prompts.length}`,
    );
  }
  for (const dureza of DUREZAS) {
    for (const nivel of NIVELES) {
      const count = yoNunca.prompts.filter((p) => p.dureza === dureza && p.nivel === nivel).length;
      if (count < MIN_YO_NUNCA_PER_BUCKET) {
        throw new Error(
          `yo-nunca.json: el bucket '${dureza}:${nivel}' requiere al menos ${MIN_YO_NUNCA_PER_BUCKET} prompts, hay ${count}`,
        );
      }
    }
  }

  const verdadOReto = verdadORetoBankSchema.parse(verdadORetoRaw);
  if (verdadOReto.prompts.length < MIN_VERDAD_O_RETO_PROMPTS) {
    throw new Error(
      `verdad-o-reto.json: se requieren al menos ${MIN_VERDAD_O_RETO_PROMPTS} prompts, hay ${verdadOReto.prompts.length}`,
    );
  }
  for (const dureza of DUREZAS) {
    for (const tipo of TIPOS) {
      for (const nivel of NIVELES) {
        const count = verdadOReto.prompts.filter(
          (p) => p.dureza === dureza && p.tipo === tipo && p.nivel === nivel,
        ).length;
        if (count < MIN_VERDAD_O_RETO_PER_BUCKET) {
          throw new Error(
            `verdad-o-reto.json: el bucket '${dureza}:${tipo}:${nivel}' requiere al menos ${MIN_VERDAD_O_RETO_PER_BUCKET} prompts, hay ${count}`,
          );
        }
      }
    }
  }

  const bombPartySilabas = bombPartySilabasBankSchema.parse(bombPartySilabasRaw);
  if (bombPartySilabas.silabas.length < MIN_BOMB_PARTY_SILABAS) {
    throw new Error(
      `bomb-party-silabas.json: se requieren al menos ${MIN_BOMB_PARTY_SILABAS} sílabas, hay ${bombPartySilabas.silabas.length}`,
    );
  }

  const bombPartyCategorias = bombPartyCategoriasBankSchema.parse(bombPartyCategoriasRaw);
  if (bombPartyCategorias.categorias.length < MIN_BOMB_PARTY_CATEGORIAS) {
    throw new Error(
      `bomb-party-categorias.json: se requieren al menos ${MIN_BOMB_PARTY_CATEGORIAS} categorías, hay ${bombPartyCategorias.categorias.length}`,
    );
  }

  const quienEsMasProbable = quienEsMasProbableBankSchema.parse(quienEsMasProbableRaw);
  if (quienEsMasProbable.prompts.length < MIN_QUIEN_ES_MAS_PROBABLE_PROMPTS) {
    throw new Error(
      `quien-es-mas-probable.json: se requieren al menos ${MIN_QUIEN_ES_MAS_PROBABLE_PROMPTS} prompts, hay ${quienEsMasProbable.prompts.length}`,
    );
  }
  for (const dureza of QUIEN_ES_MAS_PROBABLE_DUREZAS) {
    const count = quienEsMasProbable.prompts.filter((p) => p.dureza === dureza).length;
    if (count < MIN_QUIEN_ES_MAS_PROBABLE_PER_DUREZA) {
      throw new Error(
        `quien-es-mas-probable.json: la dureza '${dureza}' requiere al menos ${MIN_QUIEN_ES_MAS_PROBABLE_PER_DUREZA} prompts, hay ${count}`,
      );
    }
  }

  const diezDeDiezCualidades = diezDeDiezCualidadesBankSchema.parse(diezDeDiezCualidadesRaw);
  if (diezDeDiezCualidades.cualidades.length < MIN_DIEZ_DE_DIEZ_ITEMS) {
    throw new Error(
      `diez-de-diez-cualidades.json: se requieren al menos ${MIN_DIEZ_DE_DIEZ_ITEMS} cualidades, hay ${diezDeDiezCualidades.cualidades.length}`,
    );
  }
  const diezDeDiezPeros = diezDeDiezPerosBankSchema.parse(diezDeDiezPerosRaw);
  if (diezDeDiezPeros.peros.length < MIN_DIEZ_DE_DIEZ_ITEMS) {
    throw new Error(
      `diez-de-diez-peros.json: se requieren al menos ${MIN_DIEZ_DE_DIEZ_ITEMS} peros, hay ${diezDeDiezPeros.peros.length}`,
    );
  }
  for (const intensidad of DIEZ_DE_DIEZ_INTENSIDADES) {
    const cualidadesCount = diezDeDiezCualidades.cualidades.filter((c) => c.intensidad === intensidad).length;
    if (cualidadesCount < MIN_DIEZ_DE_DIEZ_PER_INTENSIDAD) {
      throw new Error(
        `diez-de-diez-cualidades.json: la intensidad '${intensidad}' requiere al menos ${MIN_DIEZ_DE_DIEZ_PER_INTENSIDAD} cualidades, hay ${cualidadesCount}`,
      );
    }
    const perosCount = diezDeDiezPeros.peros.filter((p) => p.intensidad === intensidad).length;
    if (perosCount < MIN_DIEZ_DE_DIEZ_PER_INTENSIDAD) {
      throw new Error(
        `diez-de-diez-peros.json: la intensidad '${intensidad}' requiere al menos ${MIN_DIEZ_DE_DIEZ_PER_INTENSIDAD} peros, hay ${perosCount}`,
      );
    }
  }

  const tabu = tabuBankSchema.parse(tabuCartasRaw);
  if (tabu.cartas.length < MIN_TABU_CARTAS) {
    throw new Error(
      `tabu-cartas.json: se requieren al menos ${MIN_TABU_CARTAS} cartas, hay ${tabu.cartas.length}`,
    );
  }
  for (const carta of tabu.cartas) {
    if (carta.prohibidas.length < 4 || carta.prohibidas.length > 5) {
      throw new Error(
        `tabu-cartas.json: la carta '${carta.palabra}' debe tener 4 o 5 palabras prohibidas, tiene ${carta.prohibidas.length}`,
      );
    }
  }

  const mimica = mimicaBankSchema.parse(mimicaCartasRaw);
  if (mimica.items.length < MIN_MIMICA_ITEMS) {
    throw new Error(
      `mimica-cartas.json: se requieren al menos ${MIN_MIMICA_ITEMS} items, hay ${mimica.items.length}`,
    );
  }

  return {
    impostorWords: impostor.words,
    triviaQuestions: trivia.questions,
    // Categorías conocidas de Trivia en vivo, derivadas del propio banco en
    // vez de mantenidas a mano — ver specs/juegos/spec.md "Live room creation
    // and join" (categoria validada contra la lista de categorías conocidas).
    triviaCategories: [...new Set(trivia.questions.map((question) => question.categoria))].sort(),
    yoNuncaPrompts: yoNunca.prompts,
    verdadORetoPrompts: verdadOReto.prompts,
    bombPartySilabas: bombPartySilabas.silabas,
    bombPartyCategorias: bombPartyCategorias.categorias,
    quienEsMasProbablePrompts: quienEsMasProbable.prompts,
    diezDeDiezCualidades: diezDeDiezCualidades.cualidades,
    diezDeDiezPeros: diezDeDiezPeros.peros,
    tabuCartas: tabu.cartas,
    tabuCategories: [...new Set(tabu.cartas.map((c) => c.categoria))].sort(),
    mimicaItems: mimica.items,
    mimicaCategories: [...new Set(mimica.items.map((i) => i.categoria))].sort(),
  };
}

// Cargado una única vez a nivel de módulo: cualquier ruta que importe esto
// obtiene los mismos arrays en memoria (ver design.md, sección "No database").
export const contentBanks: ContentBanks = loadContentBanks();
