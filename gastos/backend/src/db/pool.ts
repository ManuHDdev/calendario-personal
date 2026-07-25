import { Pool } from 'pg';

export const pool = new Pool({
  host:     process.env.GASTOS_DB_HOST     || 'localhost',
  database: process.env.GASTOS_DB_NAME     || 'gastos',
  user:     process.env.GASTOS_DB_USER     || 'gastos',
  password: process.env.GASTOS_DB_PASSWORD,
  port:     parseInt(process.env.GASTOS_DB_PORT || '5432'),
});
