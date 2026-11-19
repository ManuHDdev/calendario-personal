// Local stand-in for the production `location /launcher/` block: serves
// public/ at http://localhost:5195/launcher/. Every sub-app's dev server
// proxies /launcher to this port, so the launcher works locally exactly as it
// does behind nginx (same-origin, same path). No dependencies on purpose.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.LAUNCHER_PORT ?? 5195);
const ROOT = resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const TYPES = {
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  if (!pathname.startsWith('/launcher/')) {
    res.writeHead(404).end();
    return;
  }
  const file = normalize(join(ROOT, decodeURIComponent(pathname.slice('/launcher/'.length))));
  if (!file.startsWith(ROOT + sep)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(PORT, () => {
  console.log(`launcher dev server: http://localhost:${PORT}/launcher/launcher.js`);
});
