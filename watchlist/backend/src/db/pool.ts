import { Pool } from 'pg';

export const pool = new Pool({
  host:     process.env.WATCHLIST_DB_HOST     || 'localhost',
  database: process.env.WATCHLIST_DB_NAME     || 'watchlist',
  user:     process.env.WATCHLIST_DB_USER     || 'watchlist',
  password: process.env.WATCHLIST_DB_PASSWORD,
  port:     parseInt(process.env.WATCHLIST_DB_PORT || '5432'),
});
