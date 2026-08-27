import { Pool } from 'pg';

export const pool = new Pool({
  host:     process.env.RUTA_DB_HOST     || 'localhost',
  database: process.env.RUTA_DB_NAME     || 'ruta',
  user:     process.env.RUTA_DB_USER     || 'ruta',
  password: process.env.RUTA_DB_PASSWORD,
  port:     parseInt(process.env.RUTA_DB_PORT || '5432'),
});
