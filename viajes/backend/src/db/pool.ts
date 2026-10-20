import { Pool, types } from 'pg';

// node-postgres returns NUMERIC (OID 1700) as strings and DATE (OID 1082) as a
// JS Date at local midnight, which shifts a day across timezones. Both are
// parsed once here, before the pool exists: costs are numbers and a DATE is the
// plain 'YYYY-MM-DD' string the API exposes.
types.setTypeParser(1700, (val: string) => parseFloat(val));
types.setTypeParser(1082, (val: string) => val);

export const pool = new Pool({
  host: process.env.VIAJES_DB_HOST || 'localhost',
  database: process.env.VIAJES_DB_NAME || 'viajes',
  user: process.env.VIAJES_DB_USER || 'viajes',
  password: process.env.VIAJES_DB_PASSWORD,
  port: parseInt(process.env.VIAJES_DB_PORT || '5432', 10),
});
