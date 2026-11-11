// Parsers for the legacy flat-file workflow (productos_vine_pendientes.txt,
// resenas_listas_para_publicar.txt and the "<ASIN> - <name>" image folders).
// Pure functions: no I/O, so they are tested with inline fixtures.

export interface LegacyProduct {
  titulo: string;
  asin: string;
  descripcion: string;
  feedback: string;
  estrellas: number | null;
  /** True when the block carries the `[RESEÑA GENERADA]` marker. */
  resenaGenerada: boolean;
}

export interface LegacyReview {
  asin: string;
  producto: string;
  resena_producto: string;
  resena_resumida: string;
  resena_extendida: string;
}

type Field = 'titulo' | 'asin' | 'descripcion' | 'feedback' | 'estrellas';

const KEY_RE = /^(t[ií]tulo|asin|descripci[oó]n|feedback|estrellas)\s*:\s?(.*)$/i;
const MARKER_RE = /^\[RESE[ÑN]A GENERADA\]\s*$/i;

function fieldOf(key: string): Field {
  const k = key.toLowerCase();
  if (k.startsWith('t')) return 'titulo';
  if (k.startsWith('d')) return 'descripcion';
  return k as Field;
}

function parseStars(raw: string): number | null {
  const m = /^\s*([1-5])\s*(?:\/\s*5)?\s*$/.exec(raw);
  return m ? Number(m[1]) : null;
}

function splitLines(text: string): string[] {
  return text.replace(/^﻿/, '').split(/\r?\n/);
}

/**
 * Blocks start at a `Título:` line. Field values continue over following lines
 * until the next known key, so multi-line feedback is kept whole (blank lines
 * inside are preserved, trailing ones trimmed). Empty `ASIN:`/`Feedback:`/
 * `Estrellas:` lines and a missing `Estrellas:` line are valid.
 */
export function parseProductsTxt(text: string): LegacyProduct[] {
  const out: LegacyProduct[] = [];
  let raw = null as Record<Field, string> | null;
  let flagged = false;
  let current = null as Field | null;

  const finish = () => {
    if (!raw) return;
    out.push({
      titulo: raw.titulo.trim(),
      asin: raw.asin.trim().toUpperCase(),
      descripcion: raw.descripcion.trim(),
      feedback: raw.feedback.trim(),
      estrellas: parseStars(raw.estrellas),
      resenaGenerada: flagged,
    });
    raw = null;
    flagged = false;
    current = null;
  };

  for (const line of splitLines(text)) {
    if (MARKER_RE.test(line.trim())) {
      if (raw) flagged = true;
      current = null;
      continue;
    }
    const m = KEY_RE.exec(line);
    if (m) {
      const field = fieldOf(m[1]);
      if (field === 'titulo') finish();
      if (!raw) raw = { titulo: '', asin: '', descripcion: '', feedback: '', estrellas: '' };
      raw[field] = m[2];
      current = field;
      continue;
    }
    if (raw && current && current !== 'asin' && current !== 'estrellas') {
      raw[current] += '\n' + line;
    }
  }
  finish();
  return out;
}

const REVIEW_KEY_RE =
  /^(producto|asin|rese[ñn]a\s+(?:del\s+)?producto|rese[ñn]a\s+resumida|rese[ñn]a\s+extendida)\s*:\s?(.*)$/i;

type ReviewField = 'producto' | 'asin' | 'resena_producto' | 'resena_resumida' | 'resena_extendida';

function reviewFieldOf(key: string): ReviewField {
  const k = key.toLowerCase().replace(/\s+/g, ' ');
  if (k === 'producto') return 'producto';
  if (k === 'asin') return 'asin';
  if (k.endsWith('resumida')) return 'resena_resumida';
  if (k.endsWith('extendida')) return 'resena_extendida';
  return 'resena_producto';
}

/** Blocks are separated by `---` lines; `Reseña extendida:` may span many lines. Blocks without ASIN are dropped. */
export function parseReviewsTxt(text: string): LegacyReview[] {
  const out: LegacyReview[] = [];
  const blocks: string[][] = [[]];
  for (const line of splitLines(text)) {
    if (/^-{3,}\s*$/.test(line)) blocks.push([]);
    else blocks[blocks.length - 1].push(line);
  }
  for (const lines of blocks) {
    const r: Record<ReviewField, string> = {
      producto: '',
      asin: '',
      resena_producto: '',
      resena_resumida: '',
      resena_extendida: '',
    };
    let current: ReviewField | null = null;
    for (const line of lines) {
      const m = REVIEW_KEY_RE.exec(line);
      if (m) {
        current = reviewFieldOf(m[1]);
        r[current] = m[2];
      } else if (current && current !== 'asin') {
        r[current] += '\n' + line;
      }
    }
    const asin = r.asin.trim().toUpperCase();
    if (!asin) continue;
    out.push({
      asin,
      producto: r.producto.trim(),
      resena_producto: r.resena_producto.trim(),
      resena_resumida: r.resena_resumida.trim(),
      resena_extendida: r.resena_extendida.trim(),
    });
  }
  return out;
}

export interface ImageFolder {
  asin: string;
  name: string;
  publicado: boolean;
}

/** `B0FQBYHJ17 - Brochetas Barbacoa - PUBLICADO` -> { asin, name: 'Brochetas Barbacoa', publicado: true }. */
export function parseFolderName(folder: string): ImageFolder | null {
  const m = /^([A-Za-z0-9]{10})\s+-\s+(.+)$/.exec(folder.trim());
  if (!m) return null;
  let name = m[2].trim();
  let publicado = false;
  const p = /\s*-\s*PUBLICADO$/i.exec(name);
  if (p) {
    publicado = true;
    name = name.slice(0, p.index).trim();
  }
  return { asin: m[1].toUpperCase(), name, publicado };
}
