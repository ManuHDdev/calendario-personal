import { Pool } from 'pg';

export const pool = new Pool({
  host:     process.env.SEMAFOROS_DB_HOST     || 'localhost',
  database: process.env.SEMAFOROS_DB_NAME     || 'semaforos',
  user:     process.env.SEMAFOROS_DB_USER     || 'semaforos',
  password: process.env.SEMAFOROS_DB_PASSWORD,
  port:     parseInt(process.env.SEMAFOROS_DB_PORT || '5432'),
});

// Sin este listener, que Postgres cierre una conexion inactiva (reinicio del
// contenedor de la BD, redeploy) lanza un 'error' sin manejar y tumba todo el
// proceso. Se registra y el pool abre otra conexion en la siguiente consulta.
pool.on('error', (err) => {
  console.error('Error en una conexion inactiva del pool de Postgres:', err.message);
});
