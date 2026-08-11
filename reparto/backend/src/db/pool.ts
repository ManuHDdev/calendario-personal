import { Pool, types } from 'pg';

// node-postgres devuelve las columnas NUMERIC (OID 1700) como strings por
// defecto para no perder precisión en JS. En esta app los importes/splits se
// tratan siempre como números (backend, cálculos, respuestas JSON), así que
// se registra el parser globalmente aquí — antes de crear el pool — mismo
// patrón que gastos/backend/src/db/pool.ts.
const NUMERIC_OID = 1700;
types.setTypeParser(NUMERIC_OID, (val: string) => parseFloat(val));

export const pool = new Pool({
  host:     process.env.REPARTO_DB_HOST     || 'localhost',
  database: process.env.REPARTO_DB_NAME     || 'reparto',
  user:     process.env.REPARTO_DB_USER     || 'reparto',
  password: process.env.REPARTO_DB_PASSWORD,
  port:     parseInt(process.env.REPARTO_DB_PORT || '5432'),
});
