import { pool } from '../db/pool';

export interface CapturedEmailInput {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string | null;
}

export interface CapturedEmailRow {
  id: number;
  from_address: string;
  to_address: string;
  subject: string;
  text_body: string;
  html_body: string | null;
  received_at: string;
}

/**
 * Persiste un email "enviado" en modo mock. Lo usan tanto el adaptador mock
 * de email (envío directo desde la API) como el servidor SMTP falso
 * (`fakeSmtpServer.ts`) cuando algo le habla por SMTP de verdad — ambos
 * caminos terminan en la misma tabla, así que el inbox ve lo mismo sin
 * importar cómo llegó.
 */
export async function captureEmail(input: CapturedEmailInput): Promise<CapturedEmailRow> {
  const result = await pool.query<CapturedEmailRow>(
    `INSERT INTO mensajeria_captured_emails (from_address, to_address, subject, text_body, html_body)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, from_address, to_address, subject, text_body, html_body, received_at`,
    [input.from, input.to, input.subject, input.text, input.html ?? null],
  );
  return result.rows[0];
}

export async function listCapturedEmails(limit: number): Promise<CapturedEmailRow[]> {
  const result = await pool.query<CapturedEmailRow>(
    `SELECT id, from_address, to_address, subject, text_body, html_body, received_at
     FROM mensajeria_captured_emails
     ORDER BY received_at DESC
     LIMIT $1`,
    [limit],
  );
  return result.rows;
}

export async function getCapturedEmail(id: number): Promise<CapturedEmailRow | null> {
  const result = await pool.query<CapturedEmailRow>(
    `SELECT id, from_address, to_address, subject, text_body, html_body, received_at
     FROM mensajeria_captured_emails
     WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}
