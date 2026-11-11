import { createHash } from 'crypto';
import { createReadStream, promises as fsp } from 'fs';
import path from 'path';
import type { ProductRepository } from '../db/repository';
import type { MediaType } from '../domain/types';
import { classifyUpload, isValidAsin, maxBytesFor, mimeForExtension } from '../domain/validation';
import type { FileStore } from '../services/fileStore';
import { parseFolderName, parseProductsTxt, parseReviewsTxt } from './parsers';

export interface ImportOptions {
  txt?: string;
  images?: string;
  reviews?: string;
  botUploads?: string;
  dryRun?: boolean;
}

export interface ImportSummary {
  productsCreated: number;
  productsUpdated: number;
  productsSkipped: number;
  reviewsApplied: number;
  mediaImported: number;
  mediaDuplicates: number;
  mediaSkipped: number;
  warnings: string[];
}

export interface ImportDeps {
  repo: ProductRepository;
  store: FileStore;
  log?: (msg: string) => void;
}

async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/**
 * Idempotent legacy import. Re-running it never duplicates media (stored name
 * derives from the content hash) and never overwrites non-empty DB content.
 */
export async function runImport(opts: ImportOptions, deps: ImportDeps): Promise<ImportSummary> {
  const { repo, store } = deps;
  const log = deps.log ?? (() => undefined);
  const dry = opts.dryRun === true;
  const s: ImportSummary = {
    productsCreated: 0,
    productsUpdated: 0,
    productsSkipped: 0,
    reviewsApplied: 0,
    mediaImported: 0,
    mediaDuplicates: 0,
    mediaSkipped: 0,
    warnings: [],
  };
  const warn = (msg: string) => {
    s.warnings.push(msg);
    log(`WARN ${msg}`);
  };

  // 1) products from the txt
  if (opts.txt) {
    const products = parseProductsTxt(await fsp.readFile(opts.txt, 'utf8'));
    for (const p of products) {
      if (!isValidAsin(p.asin)) {
        warn(`skipping block without a valid ASIN: "${p.titulo.slice(0, 60)}"`);
        s.productsSkipped++;
        continue;
      }
      const existing = await repo.get(p.asin);
      if (!existing) {
        if (!dry) {
          await repo.create({
            asin: p.asin,
            titulo: p.titulo,
            descripcion: p.descripcion,
            feedback: p.feedback,
            estrellas: p.estrellas,
            estado: p.resenaGenerada ? 'resena_generada' : 'pendiente',
          });
        }
        s.productsCreated++;
        log(`create ${p.asin}`);
        continue;
      }
      // Only fill what is empty; never overwrite what the user already typed in the app.
      const patch: Record<string, unknown> = {};
      if (!existing.titulo && p.titulo) patch.titulo = p.titulo;
      if (!existing.descripcion && p.descripcion) patch.descripcion = p.descripcion;
      if (!existing.feedback.trim() && p.feedback) patch.feedback = p.feedback;
      if (existing.estrellas === null && p.estrellas !== null) patch.estrellas = p.estrellas;
      const upgrade = p.resenaGenerada && (existing.estado === 'pendiente' || existing.estado === 'listo');
      if (Object.keys(patch).length === 0 && !upgrade) {
        s.productsSkipped++;
        continue;
      }
      if (!dry) {
        if (Object.keys(patch).length > 0) await repo.update(p.asin, patch);
        if (upgrade) await repo.setEstado(p.asin, 'resena_generada');
      }
      s.productsUpdated++;
      log(`update ${p.asin}`);
    }
  }

  // 2) generated reviews
  if (opts.reviews) {
    const reviews = parseReviewsTxt(await fsp.readFile(opts.reviews, 'utf8'));
    for (const r of reviews) {
      const existing = isValidAsin(r.asin) ? await repo.get(r.asin) : null;
      if (!existing) {
        warn(`review for unknown product ${r.asin} ignored (import the txt or sync first)`);
        continue;
      }
      if (existing.estado === 'publicado') continue;
      if (existing.resena_resumida || existing.resena_extendida) continue;
      if (!r.resena_resumida && !r.resena_extendida) continue;
      if (!dry) {
        await repo.setResena(r.asin, {
          resena_producto: r.resena_producto,
          resena_resumida: r.resena_resumida,
          resena_extendida: r.resena_extendida,
        });
      }
      s.reviewsApplied++;
      log(`review ${r.asin}`);
    }
  }

  // 3) "<ASIN> - <name>" image folders
  if (opts.images) {
    const entries = await fsp.readdir(opts.images, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folder = parseFolderName(entry.name);
      if (!folder || !isValidAsin(folder.asin)) {
        warn(`folder "${entry.name}" does not match "<ASIN> - <name>", skipped`);
        continue;
      }
      const existing = await repo.get(folder.asin);
      if (folder.publicado) {
        if (!existing) {
          if (!dry) await repo.create({ asin: folder.asin, titulo: folder.name, estado: 'publicado' });
          s.productsCreated++;
          log(`create ${folder.asin} (publicado)`);
        } else if (existing.estado !== 'publicado') {
          if (!dry) await repo.setEstado(folder.asin, 'publicado');
          s.productsUpdated++;
          log(`publicado ${folder.asin}`);
        }
        continue; // photos of published products are not imported
      }
      if (!existing) {
        if (!dry) await repo.create({ asin: folder.asin, titulo: folder.name });
        s.productsCreated++;
        log(`create ${folder.asin} (from folder)`);
      }
      await importMediaDir(folder.asin, path.join(opts.images, entry.name));
    }
  }

  // 4) vine-bot uploads: <dir>/<ASIN>/<files>
  if (opts.botUploads) {
    const entries = await fsp.readdir(opts.botUploads, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const asin = entry.name.toUpperCase();
      if (!isValidAsin(asin)) {
        warn(`bot uploads folder "${entry.name}" is not an ASIN, skipped`);
        continue;
      }
      if (!(await repo.get(asin))) {
        warn(`bot uploads for unknown product ${asin} skipped (import the txt or sync first)`);
        continue;
      }
      await importMediaDir(asin, path.join(opts.botUploads, entry.name));
    }
  }

  return s;

  async function importMediaDir(asin: string, dir: string): Promise<void> {
    const product = await repo.get(asin);
    const known = new Set(product?.media.map((m) => m.filename) ?? []);
    let hasVideo = product?.media.some((m) => m.type === 'video') ?? false;

    const files = (await fsp.readdir(dir, { withFileTypes: true })).filter((f) => f.isFile()).map((f) => f.name);
    files.sort();
    for (const name of files) {
      if (name.startsWith('.')) continue;
      const full = path.join(dir, name);
      const ext = path.extname(name).slice(1).toLowerCase();
      const mime = mimeForExtension(ext);
      let info;
      try {
        if (!mime) throw new Error('unsupported');
        info = classifyUpload(name, mime);
      } catch {
        warn(`${asin}/${name}: unsupported file type, skipped`);
        s.mediaSkipped++;
        continue;
      }
      const size = (await fsp.stat(full)).size;
      if (size > maxBytesFor(info.type)) {
        warn(`${asin}/${name}: larger than the ${info.type} limit, skipped`);
        s.mediaSkipped++;
        continue;
      }
      const hash = (await sha256File(full)).slice(0, 16);
      const filename = `imp-${hash}.${info.ext}`;
      if (known.has(filename)) {
        s.mediaDuplicates++;
        continue;
      }
      if (info.type === ('video' as MediaType) && hasVideo) {
        warn(`${asin}/${name}: product already has a video, skipped`);
        s.mediaSkipped++;
        continue;
      }
      if (!dry) {
        // A previous run may have written the file and died before inserting the row: adopt it if it is intact.
        const onDisk = await store.sizeOf(asin, filename);
        if (onDisk === null) {
          await store.save(asin, filename, createReadStream(full), maxBytesFor(info.type));
        } else if (onDisk !== size) {
          throw new Error(
            `${asin}/${filename} already exists on disk with ${onDisk} bytes but the source has ${size}; ` +
              'remove the stale file and re-run',
          );
        } else {
          log(`adopt ${asin}/${filename} (file already on disk)`);
        }
        await repo.addMedia({ asin, filename, type: info.type, size });
      }
      known.add(filename);
      if (info.type === 'video') hasVideo = true;
      s.mediaImported++;
      log(`media ${asin}/${filename}`);
    }
  }
}
