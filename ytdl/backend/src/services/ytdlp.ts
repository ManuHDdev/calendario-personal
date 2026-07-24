import { execFile, spawn } from 'child_process';
import type { Readable } from 'stream';
import type { DownloadFormat } from './validation';

// Ruta a los binarios. Configurable para tests/entornos alternativos;
// en el Dockerfile se instalan como binarios estáticos en el PATH.
const YTDLP_BIN = process.env.YTDLP_PATH || 'yt-dlp';
const FFMPEG_BIN = process.env.FFMPEG_PATH || 'ffmpeg';

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
 * Handle uniforme para la descarga, sea un único proceso (mp4) o una tubería
 * de dos procesos (mp3 — ver spawnDownload). Encapsula el streaming de salida,
 * el reporte de errores y el kill-de-grupo para que routes/download.ts no
 * necesite saber cuántos procesos hay detrás.
 */
export interface DownloadHandle {
  /** Bytes del resultado final (vídeo o audio ya transcodificado). */
  readonly stdout: Readable;
  /** Notifica cada chunk de stderr de cualquiera de los procesos, para stderrTail. */
  onStderr(cb: (chunk: Buffer) => void): void;
  /** Fallo de arranque de alguno de los procesos (p.ej. binario no encontrado). */
  onError(cb: (err: Error) => void): void;
  /** Se dispara una única vez cuando la tubería completa termina. */
  onClose(cb: (code: number | null, signal: NodeJS.Signals | null) => void): void;
  /** Mata todos los procesos de la tubería. Idempotente y nunca lanza. */
  killGroup(): void;
}

/** Mata el grupo de un proceso, tragándose ESRCH (ya no existía = éxito). */
function killProcessGroup(pid: number | undefined, onWarn: (err: unknown) => void): void {
  if (!pid) return;
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ESRCH') onWarn(err);
  }
}

/**
 * mp4: usa el remux por defecto de yt-dlp, escribiendo directo a stdout con `-o -`.
 * El remux (a diferencia de la extracción de audio) sí funciona en pipe.
 */
function spawnMp4(url: string): DownloadHandle {
  const args = ['--no-playlist', '-o', '-', '--remux-video', 'mp4', '--', url];
  // detached: true hace de yt-dlp el líder de su propio grupo de procesos, para
  // poder matar también al ffmpeg que lanza internamente para el remux.
  const proc = spawn(YTDLP_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true });

  let killed = false;
  return {
    stdout: proc.stdout,
    onStderr: (cb) => proc.stderr.on('data', cb),
    onError: (cb) => proc.on('error', cb),
    onClose: (cb) => proc.on('close', cb),
    killGroup: () => {
      if (killed) return;
      killed = true;
      killProcessGroup(proc.pid, (err) =>
        console.warn('yt-dlp: fallo inesperado al matar el grupo de procesos', err),
      );
    },
  };
}

/**
 * mp3: `yt-dlp -x --audio-format mp3 -o -` NO funciona — el postprocesado de
 * extracción de audio de yt-dlp invoca ffmpeg sobre el fichero ya descargado,
 * y necesita una ruta de fichero real (seekable); con `-o -` (stdout) yt-dlp
 * omite la extracción y deja pasar el stream de audio crudo (webm/opus) tal
 * cual, aunque el proceso termine con código 0 — un fallo silencioso, no un
 * error visible. Verificado con ffprobe antes de este fix.
 *
 * En vez de depender del postprocesado de yt-dlp, se descarga el audio crudo
 * a stdout (`-f bestaudio -o -`) y se tuba manualmente a un ffmpeg propio que
 * transcodifica a mp3 sobre la marcha (`pipe:0` → `pipe:1`), sin tocar disco.
 */
function spawnMp3(url: string): DownloadHandle {
  const ytdlpArgs = ['--no-playlist', '-f', 'bestaudio', '-o', '-', '--', url];
  const ffmpegArgs = ['-i', 'pipe:0', '-vn', '-f', 'mp3', '-q:a', '2', 'pipe:1'];

  const ytdlp = spawn(YTDLP_BIN, ytdlpArgs, { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const ffmpeg = spawn(FFMPEG_BIN, ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'], detached: true });

  // El audio crudo de yt-dlp alimenta el stdin de ffmpeg. Cuando yt-dlp
  // termina (éxito o error), Node cierra el stdin de ffmpeg automáticamente
  // (pipe end-of-stream), que es lo que hace que ffmpeg también termine
  // -- si yt-dlp falló sin producir bytes, ffmpeg no tendrá stream de
  // entrada válido y terminará con código de error, propagando el fallo.
  ytdlp.stdout.pipe(ffmpeg.stdin);

  let killed = false;
  const killBoth = () => {
    if (killed) return;
    killed = true;
    const warn = (err: unknown) =>
      console.warn('yt-dlp/ffmpeg: fallo inesperado al matar el grupo de procesos', err);
    killProcessGroup(ytdlp.pid, warn);
    killProcessGroup(ffmpeg.pid, warn);
  };

  return {
    stdout: ffmpeg.stdout,
    onStderr: (cb) => {
      ytdlp.stderr.on('data', cb);
      ffmpeg.stderr.on('data', cb);
    },
    onError: (cb) => {
      // Fallo de arranque de cualquiera de los dos procesos es fatal para la
      // tubería completa: si uno no arranca, el otro se queda sin dato de
      // entrada o sin salida, así que se aborta todo de inmediato.
      ytdlp.on('error', (err) => {
        killBoth();
        cb(err);
      });
      ffmpeg.on('error', (err) => {
        killBoth();
        cb(err);
      });
    },
    // El veredicto final es el cierre de ffmpeg (última etapa de la tubería):
    // si yt-dlp falló antes de producir bytes, el stdin de ffmpeg se cierra
    // vacío y ffmpeg también termina con error, así que un único listener
    // sobre ffmpeg basta para reflejar el resultado real de toda la tubería.
    onClose: (cb) => ffmpeg.on('close', cb),
    killGroup: killBoth,
  };
}

export function spawnDownload(url: string, format: DownloadFormat): DownloadHandle {
  return format === 'mp3' ? spawnMp3(url) : spawnMp4(url);
}
