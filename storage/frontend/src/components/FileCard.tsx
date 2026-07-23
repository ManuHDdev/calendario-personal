import { useState } from 'react';
import type { FileItem } from '../types';
import { thumbnailUrl, downloadFile } from '../services/api';
import { formatSize, isImage, isVideo, isPdf } from '../hooks/useFileUtils';
import './FileCard.css';

interface Props {
  file: FileItem;
  onDelete: (file: FileItem) => void;
  onMove: (file: FileItem) => void;
  onClick: (file: FileItem) => void;
  onShare: (file: FileItem) => void;
  currentUserId: string;
  isAdmin: boolean;
  selected: boolean;
  anySelected: boolean;
  onToggleSelect: (file: FileItem) => void;
}

function IconPlay() {
  return (
    <svg className="card-icon-play" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="12" fill="rgba(0,0,0,0.5)" />
      <polygon points="9.5,7 18.5,12 9.5,17" fill="#fff" />
    </svg>
  );
}

function IconPdf() {
  return (
    <svg className="card-icon-pdf" viewBox="0 0 64 80" fill="none">
      <rect width="64" height="80" rx="6" fill="#f5f5f7" />
      <rect x="8" y="44" width="48" height="24" rx="4" fill="#ff3b30" />
      <text x="32" y="62" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="700" fontFamily="-apple-system, sans-serif">PDF</text>
      <rect x="8" y="8" width="30" height="4" rx="2" fill="#aeaeb2" />
      <rect x="8" y="18" width="40" height="4" rx="2" fill="#aeaeb2" />
      <rect x="8" y="28" width="24" height="4" rx="2" fill="#aeaeb2" />
    </svg>
  );
}

export default function FileCard({
  file, onDelete, onMove, onClick, onShare, currentUserId, isAdmin, selected, anySelected, onToggleSelect,
}: Props) {
  const [imgError, setImgError] = useState(false);
  const url = thumbnailUrl(file.relativePath);
  // Archivos legado (sin propietario registrado) siguen siendo visibles para
  // todos por diseño, así que compartirlos no tendría ningún efecto.
  const canShare = file.ownerId !== undefined && (isAdmin || file.ownerId === currentUserId);

  // stopPropagation en el <label> (para no abrir el preview) — el toggle real
  // va en onChange del <input>, así el click nativo que un <label> reenvía a
  // su checkbox asociado no dispara el toggle dos veces (una por el click del
  // label y otra por el click sintético que reenvía al input).
  const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();
  const handleToggleSelect = () => onToggleSelect(file);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    downloadFile(file.relativePath, file.name).catch(console.error);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(file);
  };

  const handleMove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMove(file);
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    onShare(file);
  };

  const renderThumbnail = () => {
    if (isImage(file.mimeType) && !imgError) {
      return (
        <img
          src={url}
          alt={file.name}
          className="card-thumb-img"
          loading="lazy"
          decoding="async"
          onError={() => setImgError(true)}
        />
      );
    }
    if (isVideo(file.mimeType)) {
      return (
        <div className="card-thumb-video">
          <IconPlay />
        </div>
      );
    }
    if (isPdf(file.mimeType)) {
      return (
        <div className="card-thumb-pdf">
          <IconPdf />
        </div>
      );
    }
    return (
      <div className="card-thumb-generic">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      </div>
    );
  };

  return (
    <div className={`file-card${selected ? ' file-card--selected' : ''}`} onClick={() => onClick(file)}>
      <div className="card-thumb">{renderThumbnail()}</div>

      <label
        className={`card-select-checkbox${anySelected || selected ? ' card-select-checkbox--visible' : ''}`}
        onClick={stopPropagation}
      >
        <input type="checkbox" checked={selected} onChange={handleToggleSelect} />
      </label>

      <div className="card-overlay-actions">
        <button className="card-action-btn" title="Descargar" onClick={handleDownload}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
        <button className="card-action-btn" title="Mover" onClick={handleMove}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <line x1="12" y1="11" x2="12" y2="17"/>
            <polyline points="9 14 12 17 15 14"/>
          </svg>
        </button>
        {canShare && (
          <button className="card-action-btn" title="Compartir" onClick={handleShare}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.6" y1="10.6" x2="15.4" y2="6.4"/><line x1="8.6" y1="13.4" x2="15.4" y2="17.6"/>
            </svg>
          </button>
        )}
        <button className="card-action-btn card-action-danger" title="Eliminar" onClick={handleDelete}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>

      <div className="card-info">
        <span className="card-name">{file.name}</span>
        <span className="card-size">{formatSize(file.size)}</span>
      </div>
    </div>
  );
}
