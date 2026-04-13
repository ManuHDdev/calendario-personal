import { Pool } from 'pg';

export const pool = new Pool({
  host:     process.env.MAPACYD_DB_HOST     || 'localhost',
  database: process.env.MAPACYD_DB_NAME     || 'mapacyd',
  user:     process.env.MAPACYD_DB_USER     || 'mapacyd',
  password: process.env.MAPACYD_DB_PASSWORD,
  port:     parseInt(process.env.MAPACYD_DB_PORT || '5432'),
});
