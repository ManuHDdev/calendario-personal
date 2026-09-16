import { Pool } from 'pg';

export const pool = new Pool({
  host:     process.env.FINANZAS_DB_HOST     || 'localhost',
  database: process.env.FINANZAS_DB_NAME     || 'finanzas',
  user:     process.env.FINANZAS_DB_USER     || 'finanzas',
  password: process.env.FINANZAS_DB_PASSWORD,
  port:     parseInt(process.env.FINANZAS_DB_PORT || '5432'),
});
