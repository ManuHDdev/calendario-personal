import { Pool } from 'pg';

export const pool = new Pool({
  host:     process.env.PARAISOS_DB_HOST     || 'localhost',
  database: process.env.PARAISOS_DB_NAME     || 'paraisos',
  user:     process.env.PARAISOS_DB_USER     || 'paraisos',
  password: process.env.PARAISOS_DB_PASSWORD,
  port:     parseInt(process.env.PARAISOS_DB_PORT || '5432'),
});
