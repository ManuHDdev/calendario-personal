import { Pool, types } from 'pg';

// node-postgres devuelve las columnas NUMERIC (OID 1700) como strings por
// defecto para no perder precisión en JS. En esta app los importes se tratan
// siempre como números (frontend, cálculos, formateo), así que se registra
// el parser globalmente aquí — antes de crear el pool — para que TODAS las
// queries devuelvan NUMERIC ya convertido a number, en vez de parchear cada
// endpoint por separado (como hacía antes solo /totales con Number(...)).
const NUMERIC_OID = 1700;
types.setTypeParser(NUMERIC_OID, (val: string) => parseFloat(val));

export const pool = new Pool({
  host:     process.env.GASTOS_DB_HOST     || 'localhost',
  database: process.env.GASTOS_DB_NAME     || 'gastos',
  user:     process.env.GASTOS_DB_USER     || 'gastos',
  password: process.env.GASTOS_DB_PASSWORD,
  port:     parseInt(process.env.GASTOS_DB_PORT || '5432'),
});
