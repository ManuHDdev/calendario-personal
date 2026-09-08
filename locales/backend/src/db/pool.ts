import { Pool } from 'pg';

export const pool = new Pool({
  host:     process.env.LOCALES_DB_HOST     || 'localhost',
  database: process.env.LOCALES_DB_NAME     || 'locales',
  user:     process.env.LOCALES_DB_USER     || 'locales',
  password: process.env.LOCALES_DB_PASSWORD,
  port:     parseInt(process.env.LOCALES_DB_PORT || '5432'),
});
