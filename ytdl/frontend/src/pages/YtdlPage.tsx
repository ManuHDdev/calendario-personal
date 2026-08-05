import { useEffect, useRef, useState } from 'react';
import { buildDownloadUrl, isAllowedYoutubeUrl, type DownloadFormat } from '../services/api';
import keycloak from '../services/keycloak';
import AppLauncher from '../components/AppLauncher';
import './YtdlPage.css';

// Cuánto tiempo esperamos leyendo el iframe oculto antes de asumir que la
// descarga arrancó correctamente (las respuestas de error SÍ se renderizan
// dentro del iframe porque no llevan Content-Disposition: attachment;
// una descarga real es interceptada por el navegador y el iframe nunca
// llega a "cargar" ese documento, así que el timeout es la señal de éxito).
// Este valor solo cubre la fase previa al streaming (fetchTitle + arranque de
// yt-dlp), no la descarga completa: una vez llegan los primeros bytes el
// navegador toma el control y este polling deja de importar. Debe superar
// con margen TITLE_TIMEOUT_MS (15s en el backend, ytdlp.ts) más latencia de
// red/proxy — nunca acercarse a DOWNLOAD_TIMEOUT_MS (10 min).
const ERROR_DETECTION_TIMEOUT_MS = 20000;
const ERROR_DETECTION_POLL_MS = 300;

export default function YtdlPage() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<DownloadFormat>('mp4');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    return () => {
      if (iframeRef.current) {
        iframeRef.current.remove();
      }
    };
  }, []);

  function validateUrl(value: string): boolean {
    if (!value.trim()) {
      setUrlError('Pega un enlace de YouTube.');
      return false;
    }
    if (!isAllowedYoutubeUrl(value.trim())) {
      setUrlError('Ese enlace no parece ser de YouTube (youtube.com, youtu.be).');
      return false;
    }
    setUrlError(null);
    return true;
  }

  function handleDownload() {
    setServerError(null);
    if (!validateUrl(url)) return;

    setLoading(true);
    const downloadUrl = buildDownloadUrl(url.trim(), format);

    // Iframe oculto: dispara la navegación (el navegador maneja el diálogo
    // de guardado de forma nativa) sin abandonar la página actual.
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    iframeRef.current = iframe;
    iframe.src = downloadUrl;

    const startedAt = Date.now();
    const poll = window.setInterval(() => {
      let errorBody: string | null = null;
      try {
        errorBody = iframe.contentDocument?.body?.innerText?.trim() || null;
      } catch {
        // Cross-origin (no debería pasar, mismo origen): tratamos como éxito.
        errorBody = null;
      }

      if (errorBody) {
        window.clearInterval(poll);
        setLoading(false);
        try {
          const parsed = JSON.parse(errorBody) as { error?: string; message?: string };
          setServerError(parsed.message || parsed.error || 'La descarga falló.');
        } catch {
          setServerError('La descarga falló.');
        }
        return;
      }

      if (Date.now() - startedAt > ERROR_DETECTION_TIMEOUT_MS) {
        window.clearInterval(poll);
        setLoading(false);
      }
    }, ERROR_DETECTION_POLL_MS);
  }

  return (
    <div className="ytdl-page">
      {keycloak.authenticated ? (
        <div className="ytdl-launcher">
          <AppLauncher upward={false} />
        </div>
      ) : (
        <button
          type="button"
          className="ytdl-login-link"
          onClick={() => keycloak.login()}
        >
          Iniciar sesión
        </button>
      )}
      <div className="ytdl-card">
        <h1>YouTube Downloader</h1>
        <p className="ytdl-subtitle">Pega un enlace, elige el formato y descarga.</p>

        <label className="ytdl-label" htmlFor="ytdl-url">
          Enlace de YouTube
        </label>
        <input
          id="ytdl-url"
          className={`ytdl-input ${urlError ? 'ytdl-input-error' : ''}`}
          type="text"
          placeholder="https://www.youtube.com/watch?v=..."
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (urlError) validateUrl(e.target.value);
          }}
          disabled={loading}
        />
        {urlError && <p className="ytdl-error">{urlError}</p>}

        <div className="ytdl-format-toggle" role="group" aria-label="Formato de descarga">
          <button
            type="button"
            className={format === 'mp4' ? 'ytdl-format-btn active' : 'ytdl-format-btn'}
            onClick={() => setFormat('mp4')}
            disabled={loading}
          >
            MP4 (vídeo)
          </button>
          <button
            type="button"
            className={format === 'mp3' ? 'ytdl-format-btn active' : 'ytdl-format-btn'}
            onClick={() => setFormat('mp3')}
            disabled={loading}
          >
            MP3 (audio)
          </button>
        </div>

        <button
          type="button"
          className="ytdl-download-btn"
          onClick={handleDownload}
          disabled={loading}
        >
          {loading ? <span className="ytdl-spinner" aria-label="Descargando" /> : 'Descargar'}
        </button>

        {serverError && <p className="ytdl-error ytdl-server-error">{serverError}</p>}
      </div>
    </div>
  );
}
