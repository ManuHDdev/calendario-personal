import path from 'path';

/**
 * Un STORAGE_PATH por worker de vitest.
 *
 * Los ficheros de test corren en paralelo y cada uno limpia "su" NAS en el
 * beforeEach. Con un único directorio compartido, el de uno borraba los
 * archivos del otro a media ejecución y los fallos salían aleatorios. Los
 * workers no ejecutan dos ficheros a la vez, así que un directorio por worker
 * basta para aislarlos.
 */
const workerId = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? '1';
process.env.STORAGE_PATH = path.join(process.cwd(), '.test-storage', `w${workerId}`);
