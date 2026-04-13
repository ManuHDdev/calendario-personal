import { useEffect } from 'react';
import type { FileItem } from '../types';
import { previewUrl, downloadFile } from '../services/api';
import { formatSize } from '../hooks/useFileUtils';
import './PreviewModal.css';

interface Props {
  file: FileItem;
  onClose: () => void;
}

export default function PreviewModal({ file, onClose }: Props) {
  const url = previewUrl(file.relativePath);

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleDownload = () => {
    downloadFile(file.relativePath, file.name).catch(console.error);
  };

  const BROWSER_VIDEO = new Set(['video/mp4', 'video/webm', 'video/ogg']);

  const renderContent = () => {
    if (file.mimeType.startsWith('image/')) {
      return <img src={url} alt={file.name} className="preview-image" />;
    }
    if (file.mimeType.startsWith('video/')) {
      if (!BROWSER_VIDEO.has(file.mimeType)) {
        const ext = file.name.split('.').pop()?.toUpperCase() ?? 'vídeo';
        return (
          <div className="preview-unsupported">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
            </svg>
            <p>El formato <strong>.{ext.toLowerCase()}</strong> no es reproducible en el navegador.</p>
            <p className="preview-unsupported-hint">Descarga el archivo para verlo con un reproductor local, o sube el vídeo en formato <strong>MP4</strong>.</p>
          </div>
        );
      }
      return (
        <video controls className="preview-video" key={file.id}>
          <source src={url} type={file.mimeType} />
        </video>
      );
    }
    if (file.mimeType === 'application/pdf') {
      return <iframe src={url} title={file.name} className="preview-pdf" />;
    }
    return (
      <div className="preview-unsupported">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
        </svg>
        <p>Vista previa no disponible para este formato.</p>
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-file-info">
            <span className="modal-file-name">{file.name}</span>
            <span className="modal-file-size">{formatSize(file.size)}</span>
          </div>
          <div className="modal-actions">
            <button className="modal-btn-download" onClick={handleDownload} title="Descargar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Descargar
            </button>
            <button className="modal-btn-close" onClick={onClose} title="Cerrar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="modal-body">{renderContent()}</div>
      </div>
    </div>
  );
}
