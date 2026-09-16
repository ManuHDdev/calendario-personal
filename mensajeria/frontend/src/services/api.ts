import keycloak from './keycloak';

const BASE = '/mensajeria/api';

function headers(): Record<string, string> {
  const token = keycloak.token;
  if (!token) throw new Error('No auth token');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function handleError(res: Response): Promise<never> {
  let msg = `Error ${res.status}`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) msg = body.error;
  } catch {
    /* ignore */
  }
  throw new Error(msg);
}

export type Channel = 'email' | 'sms' | 'call';

export interface SendMessageInput {
  channel: Channel;
  to: string;
  from?: string;
  subject?: string;
  body: string;
  html?: string;
}

export interface SendMessageResult {
  channel: Channel;
  mode: 'mock' | 'real';
  status: string;
  providerId?: string | null;
  recordId?: number | null;
}

export interface CapturedEmail {
  id: number;
  from_address: string;
  to_address: string;
  subject: string;
  text_body: string;
  html_body: string | null;
  received_at: string;
}

export interface MessageLogEntry {
  id: number;
  channel: 'sms' | 'call';
  to_address: string;
  from_address: string | null;
  body: string;
  status: string;
  mode: 'mock' | 'real';
  provider_id: string | null;
  created_at: string;
}

export async function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const res = await fetch(`${BASE}/send`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(input),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<SendMessageResult>;
}

export async function getInboxEmails(): Promise<CapturedEmail[]> {
  const res = await fetch(`${BASE}/inbox/emails`, { headers: headers() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<CapturedEmail[]>;
}

export async function getInboxEmail(id: number): Promise<CapturedEmail> {
  const res = await fetch(`${BASE}/inbox/emails/${id}`, { headers: headers() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<CapturedEmail>;
}

export async function getInboxLog(channel?: 'sms' | 'call'): Promise<MessageLogEntry[]> {
  const qs = channel ? `?channel=${channel}` : '';
  const res = await fetch(`${BASE}/inbox/log${qs}`, { headers: headers() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<MessageLogEntry[]>;
}

export async function getInboxLogEntry(id: number): Promise<MessageLogEntry> {
  const res = await fetch(`${BASE}/inbox/log/${id}`, { headers: headers() });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<MessageLogEntry>;
}
