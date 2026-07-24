import { execFile, spawn, ChildProcessByStdio } from 'child_process';
import type { Readable } from 'stream';
import type { DownloadFormat } from './validation';

export type YtdlpChildProcess = ChildProcessByStdio<null, Readable, Readable>;

// Ruta al binario yt-dlp. Configurable para tests/entornos alternativos;
// en el Dockerfile se instala como binario estático en el PATH.
const YTDLP_BIN = process.env.YTDLP_PATH || 'yt-dlp';

const TITLE_TIMEOUT_MS = 15_000;
export const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000; // 10 min, hard wall-clock cap

/**
 * Obtiene el título del vídeo vía `yt-dlp --print %(title)s`.
 * Se invoca con execFile (argv array, nunca un string de shell) para que
 * la URL del usuario nunca llegue a un shell.
 */
export function fetchTitle(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      YTDLP_BIN,
      ['--print', '%(title)s', '--no-playlist', '--', url],
      { timeout: TITLE_TIMEOUT_MS },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

/**
 * Construye el argv para la descarga. mp4 usa el remux por defecto de yt-dlp;
 * mp3 usa -x --audio-format mp3 (yt-dlp invoca ffmpeg internamente).
 * `-o -` escribe el resultado a stdout para poder pipearlo directo a la respuesta.
 */
function buildDownloadArgs(url: string, format: DownloadFormat): string[] {
  const base = ['--no-playlist', '-o', '-'];

  if (format === 'mp3') {
    return [...base, '-x', '--audio-format', 'mp3', '--', url];
  }

  return [...base, '--remux-video', 'mp4', '--', url];
}

/**
 * Lanza yt-dlp como child process (spawn con argv array, nunca shell string)
 * y devuelve el proceso para que la ruta gestione streaming, timeout y cleanup.
 */
export function spawnDownload(url: string, format: DownloadFormat): YtdlpChildProcess {
  const args = buildDownloadArgs(url, format);
  // detached: true hace de yt-dlp el líder de su propio grupo de procesos, para
  // poder matar también al ffmpeg que lanza internamente (ver kill sites en
  // routes/download.ts, que señalizan el grupo entero con process.kill(-pid)).
  return spawn(YTDLP_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
}
