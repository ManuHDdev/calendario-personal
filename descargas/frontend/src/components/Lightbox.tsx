import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { DirEntry } from '../lib/files';
import { formatSize } from '../lib/files';
import { downloadUrl, fileUrl } from '../services/api';
import './Viewer.css';

interface Props {
  images: DirEntry[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

export default function Lightbox({ images, index, onIndexChange, onClose }: Props) {
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
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  // Built once per image so the token refresh tick does not reload it.
  const src = useMemo(() => fileUrl(current.path), [current.path]);
  const download = useMemo(() => downloadUrl(current.path), [current.path]);

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
        <button className="viewer-btn" onClick={onClose} aria-label="Cerrar visor">
          Cerrar
        </button>
      </header>

      <img className="viewer-image" src={src} alt={current.name} onClick={(e) => e.stopPropagation()} />

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
