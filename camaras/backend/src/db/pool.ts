import { Pool } from 'pg';

export const pool = new Pool({
  host:     process.env.CAMARAS_DB_HOST     || 'localhost',
  database: process.env.CAMARAS_DB_NAME     || 'camaras',
  user:     process.env.CAMARAS_DB_USER     || 'camaras',
  password: process.env.CAMARAS_DB_PASSWORD,
  port:     parseInt(process.env.CAMARAS_DB_PORT || '5432'),
});
