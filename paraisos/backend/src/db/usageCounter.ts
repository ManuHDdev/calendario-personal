import { pool } from './pool';

/**
 * Contador de uso de una API externa, persistido en Postgres para que
 * sobreviva a un redeploy (a diferencia del contador en memoria que sustituye
 * — ver openspec/changes/2026-09-09-add-api-usage-dashboard). Una fila por
 * `(api_name, usage_date)`, día natural en UTC.
 */

export interface SqlQuery {
  text: string;
  values: unknown[];
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Query builder puro — testeable sin Postgres real (mismo patrón que db/queries.ts). */
export function incrementUsageQuery(apiName: string, usageDate: string): SqlQuery {
  return {
    text: `INSERT INTO api_usage_counter (api_name, usage_date, calls)
           VALUES ($1, $2, 1)
           ON CONFLICT (api_name, usage_date)
           DO UPDATE SET calls = api_usage_counter.calls + 1`,
    values: [apiName, usageDate],
  };
}

/** Query builder puro — testeable sin Postgres real. */
export function getUsageTodayQuery(apiName: string, usageDate: string): SqlQuery {
  return {
    text: `SELECT calls FROM api_usage_counter WHERE api_name = $1 AND usage_date = $2`,
    values: [apiName, usageDate],
  };
}

/**
 * Incrementa en 1 el contador de hoy para `apiName`. Llamar una sola vez por
 * llamada real a la API externa (nunca en un cache hit).
 */
export async function incrementUsage(apiName: string): Promise<void> {
  const { text, values } = incrementUsageQuery(apiName, todayUtc());
  await pool.query(text, values);
}

/**
 * Llamadas de hoy para `apiName`. 0 si no hay fila (aun no se ha llamado hoy).
 */
export async function getUsageToday(apiName: string): Promise<number> {
  const { text, values } = getUsageTodayQuery(apiName, todayUtc());
  const result = await pool.query<{ calls: number }>(text, values);
  return result.rows[0]?.calls ?? 0;
}

/** Próximo medianoche UTC, para el campo `resetsAt` de la respuesta de uso. */
export function nextUtcMidnight(): string {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next.toISOString();
}
