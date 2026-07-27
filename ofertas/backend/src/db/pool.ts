import { Pool } from 'pg';

export const pool = new Pool({
  host:     process.env.OFERTAS_DB_HOST     || 'localhost',
  database: process.env.OFERTAS_DB_NAME     || 'ofertas',
  user:     process.env.OFERTAS_DB_USER     || 'ofertas',
  password: process.env.OFERTAS_DB_PASSWORD,
  port:     parseInt(process.env.OFERTAS_DB_PORT || '5432'),
});
