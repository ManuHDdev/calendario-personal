import { z } from 'zod';
import impostorWordsRaw from './impostor-words.json';
import triviaQuestionsRaw from './trivia-questions.json';
import yoNuncaRaw from './yo-nunca.json';
import verdadORetoRaw from './verdad-o-reto.json';

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

export interface VerdadORetoPrompt {
  texto: string;
  tipo: VerdadORetoTipo;
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

const promptSchema = z.string().min(1);
const yoNuncaBankSchema = z.object({ prompts: z.array(promptSchema) });

const verdadORetoPromptSchema = z.object({
  texto: z.string().min(1),
  tipo: z.enum(['verdad', 'reto']),
});
const verdadORetoBankSchema = z.object({ prompts: z.array(verdadORetoPromptSchema) });

const MIN_IMPOSTOR_WORDS = 300;
const MIN_TRIVIA_QUESTIONS = 500;
const MIN_YO_NUNCA_PROMPTS = 150;
const MIN_VERDAD_O_RETO_PROMPTS = 150;

export interface ContentBanks {
  impostorWords: ImpostorWord[];
  triviaQuestions: TriviaQuestion[];
  triviaCategories: string[];
  yoNuncaPrompts: string[];
  verdadORetoPrompts: VerdadORetoPrompt[];
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

  const verdadOReto = verdadORetoBankSchema.parse(verdadORetoRaw);
  if (verdadOReto.prompts.length < MIN_VERDAD_O_RETO_PROMPTS) {
    throw new Error(
      `verdad-o-reto.json: se requieren al menos ${MIN_VERDAD_O_RETO_PROMPTS} prompts, hay ${verdadOReto.prompts.length}`,
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
  };
}

// Cargado una única vez a nivel de módulo: cualquier ruta que importe esto
// obtiene los mismos arrays en memoria (ver design.md, sección "No database").
export const contentBanks: ContentBanks = loadContentBanks();
