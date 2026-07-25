import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { pool } from '../db/pool';
import { runOcr } from './runOcr';
import { parseTicket } from './parseTicket';
import { parseBanco } from './parseBanco';
import type { DraftGasto, Gasto } from '../types/gasto';

export type Perfil = 'ticket' | 'banco';

const IMAGES_PATH = process.env.GASTOS_IMAGES_PATH || './data/images';

/** Mapea el perfil elegido por el propietario (botón "Ticket"/"Banco" en el bot) a su parser. */
export function selectParser(perfil: Perfil): (text: string) => DraftGasto {
  return perfil === 'ticket' ? parseTicket : parseBanco;
}

export interface OcrPipelineResult {
  gasto: Gasto;
  draft: DraftGasto;
}

/**
 * Pipeline completo compartido por el endpoint HTTP interno y el bot de
 * Telegram (llamada in-process, no un segundo salto HTTP — ver design.md):
 * OCR + parseo según perfil, persistencia de la imagen origen en
 * GASTOS_IMAGES_PATH, y creación del `gasto` SIEMPRE en
 * estado='pendiente_revision' (nunca auto-confirmado).
 */
export async function runOcrPipeline(imageBuffer: Buffer, perfil: Perfil): Promise<OcrPipelineResult> {
  const text = await runOcr(imageBuffer);
  const parse = selectParser(perfil);
  const draft = parse(text);

  await fs.mkdir(IMAGES_PATH, { recursive: true });
  const imagenPath = path.join(IMAGES_PATH, `${randomUUID()}.jpg`);
  await fs.writeFile(imagenPath, imageBuffer);

  const result = await pool.query<Gasto>(
    `INSERT INTO gasto (importe, fecha, comercio, concepto, origen, estado, imagen_path)
     VALUES ($1, $2, $3, $4, $5, 'pendiente_revision', $6)
     RETURNING *`,
    [draft.importe ?? 0, draft.fecha, draft.comercio, draft.concepto ?? null, perfil, imagenPath],
  );

  return { gasto: result.rows[0], draft };
}
