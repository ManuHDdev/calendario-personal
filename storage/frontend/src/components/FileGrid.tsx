import { useEffect, useRef, useState } from 'react';
import type { FileItem } from '../types';
import FileCard from './FileCard';
import './FileGrid.css';

// Cuántos FileCard se montan de una vez. Con carpetas grandes, montar todos
// los archivos de golpe (miniaturas, listeners, etc. por cada tarjeta) es lo
// que ralentiza la vista — el "loading=lazy" de las <img> ya difiere la
// descarga de la miniatura, pero no evita el coste de montar el DOM de cada
// tarjeta. Se renderiza en tandas y se amplía la ventana al hacer scroll.
const PAGE_SIZE = 60;

interface Props {
  files: FileItem[];
  loading: boolean;
  onDeleteFile: (file: FileItem) => void;
  onMoveFile: (file: FileItem) => void;
  onPreviewFile: (file: FileItem) => void;
  onShareFile: (file: FileItem) => void;
  currentUserId: string;
  isAdmin: boolean;
  selected: Set<string>;
  onToggleSelect: (file: FileItem) => void;
  /** Cambia cuando cambia la carpeta activa o la búsqueda, para reiniciar la ventana visible. */
  resetKey: string;
}

export default function FileGrid({
  files, loading, onDeleteFile, onMoveFile, onPreviewFile, onShareFile, currentUserId, isAdmin,
  selected, onToggleSelect, resetKey,
}: Props) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Nueva carpeta o búsqueda distinta -> volver a mostrar solo la primera tanda.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [resetKey]);

  // Ampliar la ventana visible cuando el centinela del final entra en viewport.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((v) => Math.min(v + PAGE_SIZE, files.length));
        }
      },
      { rootMargin: '600px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [files.length]);

  if (loading) {
    return (
      <div className="grid-empty">
        <div className="grid-spinner" />
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="grid-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1">
          <path d="M3 3h18v18H3z" rx="2" />
          <path d="M3 9h18M9 21V9"/>
        </svg>
        <p>No hay archivos aquí todavía</p>
      </div>
    );
  }

  const visibleFiles = files.slice(0, visibleCount);

  return (
    <div className="file-grid">
      {visibleFiles.map((file) => (
        <FileCard
          key={file.id}
          file={file}
          onDelete={onDeleteFile}
          onMove={onMoveFile}
          onClick={onPreviewFile}
          onShare={onShareFile}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          selected={selected.has(file.id)}
          anySelected={selected.size > 0}
          onToggleSelect={onToggleSelect}
        />
      ))}
      {visibleCount < files.length && (
        <div ref={sentinelRef} className="file-grid-sentinel" aria-hidden="true" />
      )}
    </div>
  );
}
