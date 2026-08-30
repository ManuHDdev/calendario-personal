import { Pool } from 'pg';

export const pool = new Pool({
  host:     process.env.PISOS_DB_HOST     || 'localhost',
  database: process.env.PISOS_DB_NAME     || 'pisos',
  user:     process.env.PISOS_DB_USER     || 'pisos',
  password: process.env.PISOS_DB_PASSWORD,
  port:     parseInt(process.env.PISOS_DB_PORT || '5432'),
});
