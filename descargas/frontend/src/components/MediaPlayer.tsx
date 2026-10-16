import { useEffect, useMemo, useRef, useState } from 'react';
import type { DirEntry } from '../lib/files';
import { formatSize } from '../lib/files';
import { downloadUrl, fileUrl, refreshToken } from '../services/api';
import './Viewer.css';

interface Props {
  entry: DirEntry;
  onClose: () => void;
}

/** Inline video/audio player. Seeking works through HTTP Range on the backend. */
export default function MediaPlayer({ entry, onClose }: Props) {
  const initial = useMemo(() => fileUrl(entry.path), [entry.path]);
  const download = useMemo(() => downloadUrl(entry.path), [entry.path]);
  const [src, setSrc] = useState(initial);
  const [error, setError] = useState(false);
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const resumeAt = useRef<number | null>(null);
  const retried = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // A long playback can outlive the access token embedded in the URL: on a
  // network/401 error, fetch a fresh token and resume where it stopped (once).
  const handleError = async () => {
    if (retried.current) {
      setError(true);
      return;
    }
    retried.current = true;
    resumeAt.current = mediaRef.current?.currentTime ?? 0;
    await refreshToken(30);
    setSrc(fileUrl(entry.path));
  };

  const common = {
    ref: mediaRef,
    src,
    controls: true,
    autoPlay: true,
    preload: 'metadata' as const,
    onError: handleError,
    onLoadedMetadata: () => {
      if (resumeAt.current && mediaRef.current) {
        mediaRef.current.currentTime = resumeAt.current;
        resumeAt.current = null;
      }
    },
  };

  return (
    <div className="viewer-backdrop" role="dialog" aria-modal="true" aria-label={entry.name} onClick={onClose}>
      <header className="viewer-bar" onClick={(e) => e.stopPropagation()}>
        <div className="viewer-title">
          <strong>{entry.name}</strong>
          <span>{formatSize(entry.size)}</span>
        </div>
        <a className="viewer-btn" href={download} download title="Descargar">
          Descargar
        </a>
        <button className="viewer-btn" onClick={onClose} aria-label="Cerrar reproductor">
          Cerrar
        </button>
      </header>

      <div className="viewer-media" onClick={(e) => e.stopPropagation()}>
        {error ? (
          <p className="viewer-error">No se puede reproducir este archivo en el navegador. Prueba a descargarlo.</p>
        ) : entry.category === 'video' ? (
          <video {...common} playsInline />
        ) : (
          <audio {...common} />
        )}
      </div>
    </div>
  );
}
