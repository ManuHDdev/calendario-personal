import { Pool } from 'pg';

export const pool = new Pool({
  host: process.env.VINE_RESENAS_DB_HOST || 'localhost',
  database: process.env.VINE_RESENAS_DB_NAME || 'vine_resenas',
  user: process.env.VINE_RESENAS_DB_USER || 'vine_resenas',
  password: process.env.VINE_RESENAS_DB_PASSWORD,
  port: parseInt(process.env.VINE_RESENAS_DB_PORT || '5432', 10),
});

// Without a listener, Postgres closing an idle connection would crash the process.
pool.on('error', (err) => {
  console.error('Unexpected pg pool error:', err.message);
});
