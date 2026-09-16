import { pool } from '../db/pool';
import type { Channel, Mode } from '../adapters/types';

export interface MessageLogInput {
  channel: Exclude<Channel, 'email'>;
  to: string;
  from: string | null;
  body: string;
  status: string;
  mode: Mode;
  providerId?: string | null;
}

export interface MessageLogRow {
  id: number;
  channel: string;
  to_address: string;
  from_address: string | null;
  body: string;
  status: string;
  mode: string;
  provider_id: string | null;
  created_at: string;
}

export async function logMessage(input: MessageLogInput): Promise<MessageLogRow> {
  const result = await pool.query<MessageLogRow>(
    `INSERT INTO mensajeria_message_log (channel, to_address, from_address, body, status, mode, provider_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, channel, to_address, from_address, body, status, mode, provider_id, created_at`,
    [input.channel, input.to, input.from, input.body, input.status, input.mode, input.providerId ?? null],
  );
  return result.rows[0];
}

export async function listMessageLog(limit: number, channel?: 'sms' | 'call'): Promise<MessageLogRow[]> {
  if (channel) {
    const result = await pool.query<MessageLogRow>(
      `SELECT id, channel, to_address, from_address, body, status, mode, provider_id, created_at
       FROM mensajeria_message_log
       WHERE channel = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [channel, limit],
    );
    return result.rows;
  }
  const result = await pool.query<MessageLogRow>(
    `SELECT id, channel, to_address, from_address, body, status, mode, provider_id, created_at
     FROM mensajeria_message_log
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );
  return result.rows;
}

export async function getMessageLogEntry(id: number): Promise<MessageLogRow | null> {
  const result = await pool.query<MessageLogRow>(
    `SELECT id, channel, to_address, from_address, body, status, mode, provider_id, created_at
     FROM mensajeria_message_log
     WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}
