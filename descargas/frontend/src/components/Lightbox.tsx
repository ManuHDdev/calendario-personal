import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DirEntry } from '../lib/files';
import { formatSize } from '../lib/files';
import { downloadUrl, fileUrl, thumbUrl } from '../services/api';
import './Viewer.css';
import './DeleteUi.css';

interface Props {
  images: DirEntry[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** When set, an "Eliminar" button is shown (only for users allowed to delete). */
  onDelete?: (entry: DirEntry) => void;
  /** Ignore the keyboard (e.g. while the delete confirmation is open). */
  keysDisabled?: boolean;
}

export default function Lightbox({ images, index, onIndexChange, onClose, onDelete, keysDisabled = false }: Props) {
  const current = images[index];
  const touchStartX = useRef<number | null>(null);

  const go = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next >= 0 && next < images.length) onIndexChange(next);
    },
    [index, images.length, onIndexChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (keysDisabled) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose, keysDisabled]);

  // Built once per image so the token refresh tick does not reload it.
  const src = useMemo(() => fileUrl(current.path), [current.path]);
  const download = useMemo(() => downloadUrl(current.path), [current.path]);
  // The grid already loaded this thumbnail, so it is usually cached: show it
  // instantly while the full-size original downloads.
  const preview = useMemo(() => thumbUrl(current.path, 640), [current.path]);
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const originalLoaded = loadedPath === current.path;

  useEffect(() => setPreviewFailed(false), [current.path]);

  return (
    <div
      className="viewer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={current.name}
      onClick={onClose}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(dx) > 60) go(dx > 0 ? -1 : 1);
      }}
    >
      <header className="viewer-bar" onClick={(e) => e.stopPropagation()}>
        <div className="viewer-title">
          <strong>{current.name}</strong>
          <span>
            {index + 1} / {images.length} · {formatSize(current.size)}
          </span>
        </div>
        <a className="viewer-btn" href={download} download title="Descargar">
          Descargar
        </a>
        {onDelete && (
          <button
            className="viewer-btn viewer-btn--danger"
            onClick={() => onDelete(current)}
            aria-label={`Eliminar ${current.name}`}
          >
            Eliminar
          </button>
        )}
        <button className="viewer-btn" onClick={onClose} aria-label="Cerrar visor">
          Cerrar
        </button>
      </header>

      {!originalLoaded && !previewFailed && (
        <img
          className="viewer-image viewer-image--preview"
          src={preview}
          alt=""
          aria-hidden="true"
          onError={() => setPreviewFailed(true)}
        />
      )}
      <img
        className="viewer-image"
        src={src}
        alt={current.name}
        style={originalLoaded || previewFailed ? undefined : { opacity: 0 }}
        onLoad={() => setLoadedPath(current.path)}
        onClick={(e) => e.stopPropagation()}
      />

      {index > 0 && (
        <button
          className="viewer-nav viewer-nav--prev"
          aria-label="Imagen anterior"
          onClick={(e) => {
            e.stopPropagation();
            go(-1);
          }}
        >
          ‹
        </button>
      )}
      {index < images.length - 1 && (
        <button
          className="viewer-nav viewer-nav--next"
          aria-label="Imagen siguiente"
          onClick={(e) => {
            e.stopPropagation();
            go(1);
          }}
        >
          ›
        </button>
      )}
    </div>
  );
}
