import { parseArgs } from 'util';
import { ensureSchema } from '../db/ensureSchema';
import { pool } from '../db/pool';
import { PgProductRepository } from '../db/repository';
import { runImport } from '../importer/runImport';
import { FsFileStore } from '../services/fileStore';

const USAGE = `Usage: npm run import:legacy -- [--txt <productos_vine_pendientes.txt>] [--reviews <resenas_listas_para_publicar.txt>]
                               [--images <imagenes_resenas dir>] [--bot-uploads <vine-bot uploads dir>] [--dry-run]
Idempotent. Needs the VINE_RESENAS_DB_* and DATA_DIR environment variables.`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      txt: { type: 'string' },
      reviews: { type: 'string' },
      images: { type: 'string' },
      'bot-uploads': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help || (!values.txt && !values.images && !values['bot-uploads'] && !values.reviews)) {
    console.log(USAGE);
    return;
  }

  await ensureSchema();
  const summary = await runImport(
    {
      txt: values.txt,
      reviews: values.reviews,
      images: values.images,
      botUploads: values['bot-uploads'],
      dryRun: values['dry-run'],
    },
    {
      repo: new PgProductRepository(pool),
      store: new FsFileStore(process.env.DATA_DIR || '/data'),
      log: (m) => console.log(m),
    },
  );
  console.log(`\n${values['dry-run'] ? '[dry-run] ' : ''}Done:`, { ...summary, warnings: summary.warnings.length });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
