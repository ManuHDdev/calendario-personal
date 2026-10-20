/**
 * Importa los semaforos de una ciudad:
 *   npm run importar -- "Cáceres"
 * En el contenedor: docker exec semaforos-backend node dist/scripts/importar.js "Cáceres"
 */
import { ensureSchema } from '../db/ensureSchema';
import { pool } from '../db/pool';
import { importarCiudad } from '../services/importadorOsm';

async function main() {
  const ciudad = process.argv[2];
  if (!ciudad) {
    console.error('Uso: importar "<municipio>"');
    process.exit(1);
  }
  await ensureSchema();
  const resumen = await importarCiudad(ciudad);
  console.log(JSON.stringify(resumen, null, 2));
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
