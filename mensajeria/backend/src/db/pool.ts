import { Pool } from 'pg';

export const pool = new Pool({
  host:     process.env.MENSAJERIA_DB_HOST     || 'localhost',
  database: process.env.MENSAJERIA_DB_NAME     || 'mensajeria',
  user:     process.env.MENSAJERIA_DB_USER     || 'mensajeria',
  password: process.env.MENSAJERIA_DB_PASSWORD,
  port:     parseInt(process.env.MENSAJERIA_DB_PORT || '5432'),
});
