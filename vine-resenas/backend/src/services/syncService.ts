import { z } from 'zod';
import { HttpError } from '../errors';
import type { ProductRepository } from '../db/repository';
import { isValidAsin } from '../domain/validation';

/** Fetches the JSON body of the vine-bot pending-products endpoint. Injectable for tests. */
export type BotFetcher = (url: string, token: string | undefined) => Promise<unknown>;

const botItemSchema = z.object({
  asin: z.string(),
  titulo: z.string().default(''),
  descripcion: z.string().default(''),
});

export interface SyncResult {
  created: string[];
  skipped: number;
}

export interface SyncConfig {
  botUrl: string;
  botToken?: string;
}

export const defaultBotFetcher: BotFetcher = async (url, token) => {
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`vine-bot responded ${res.status}`);
  return res.json();
};

/**
 * Pulls pending products from vine-bot and inserts ONLY the ASINs that do not
 * exist yet (never overwrites anything). `skipped` counts existing ASINs plus
 * malformed items.
 */
export async function syncProducts(
  repo: ProductRepository,
  fetcher: BotFetcher,
  config: SyncConfig,
): Promise<SyncResult> {
  const url = `${config.botUrl.replace(/\/+$/, '')}/productos-pendientes`;
  let body: unknown;
  try {
    body = await fetcher(url, config.botToken);
  } catch (err) {
    throw new HttpError(502, 'BadGateway', `Could not reach vine-bot: ${err instanceof Error ? err.message : 'error'}`);
  }
  if (!Array.isArray(body)) {
    throw new HttpError(502, 'BadGateway', 'vine-bot returned an unexpected payload (expected a JSON array)');
  }

  const created: string[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  for (const raw of body) {
    const parsed = botItemSchema.safeParse(raw);
    const asin = parsed.success ? parsed.data.asin.trim().toUpperCase() : '';
    if (!parsed.success || !isValidAsin(asin) || seen.has(asin)) {
      skipped++;
      continue;
    }
    seen.add(asin);
    const inserted = await repo.create({
      asin,
      titulo: parsed.data.titulo,
      descripcion: parsed.data.descripcion,
    });
    if (inserted) created.push(asin);
    else skipped++;
  }
  return { created, skipped };
}
