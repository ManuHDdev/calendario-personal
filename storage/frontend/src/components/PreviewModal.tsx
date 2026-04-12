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

  const renderContent = () => {
    if (file.mimeType.startsWith('image/')) {
      return <img src={url} alt={file.name} className="preview-image" />;
    }
    if (file.mimeType.startsWith('video/')) {
      return (
        <video controls className="preview-video" key={file.id}>
          <source src={url} type={file.mimeType} />
          Tu navegador no soporta la reproducción de vídeo.
        </video>
      );
    }
    if (file.mimeType === 'application/pdf') {
      return <iframe src={url} title={file.name} className="preview-pdf" />;
    }
    return (
      <div className="preview-unsupported">
        <span>Vista previa no disponible</span>
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
