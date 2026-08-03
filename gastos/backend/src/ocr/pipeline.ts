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
 * OCR + parseo según perfil — sin efectos secundarios (ni escritura a disco
 * ni acceso a BD). Usada tanto por el flujo interactivo del bot de Telegram
 * (que difiere la persistencia hasta que el propietario confirma con
 * /enviar — ver telegram/bot.ts) como por runOcrPipeline más abajo.
 */
export async function parseImage(imageBuffer: Buffer, perfil: Perfil): Promise<DraftGasto> {
  const text = await runOcr(imageBuffer);
  const parse = selectParser(perfil);
  return parse(text);
}

/**
 * Persiste un draft ya confirmado: guarda la imagen origen en
 * GASTOS_IMAGES_PATH y crea el `gasto` SIEMPRE en estado='pendiente_revision'
 * (nunca auto-confirmado).
 */
export async function persistGasto(draft: DraftGasto, perfil: Perfil, imageBuffer: Buffer): Promise<Gasto> {
  await fs.mkdir(IMAGES_PATH, { recursive: true });
  const imagenPath = path.join(IMAGES_PATH, `${randomUUID()}.jpg`);
  await fs.writeFile(imagenPath, imageBuffer);

  const result = await pool.query<Gasto>(
    `INSERT INTO gasto (importe, fecha, comercio, concepto, origen, estado, imagen_path)
     VALUES ($1, $2, $3, $4, $5, 'pendiente_revision', $6)
     RETURNING *`,
    [draft.importe ?? 0, draft.fecha, draft.comercio, draft.concepto ?? null, perfil, imagenPath],
  );

  return result.rows[0];
}

/**
 * Pipeline completo compartido por el endpoint HTTP interno POST /gastos/ocr
 * (ver routes/gastos.ts), cuyo contrato exige crear el gasto SIEMPRE de
 * inmediato — no debe cambiar. Mera composición de parseImage + persistGasto
 * para mantener su comportamiento idéntico al de antes de la separación.
 */
export async function runOcrPipeline(imageBuffer: Buffer, perfil: Perfil): Promise<OcrPipelineResult> {
  const draft = await parseImage(imageBuffer, perfil);
  const gasto = await persistGasto(draft, perfil, imageBuffer);
  return { gasto, draft };
}
