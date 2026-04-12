import type { FileItem } from '../types';
import FileCard from './FileCard';
import './FileGrid.css';

interface Props {
  files: FileItem[];
  loading: boolean;
  onDeleteFile: (file: FileItem) => void;
  onMoveFile: (file: FileItem) => void;
  onPreviewFile: (file: FileItem) => void;
}

export default function FileGrid({ files, loading, onDeleteFile, onMoveFile, onPreviewFile }: Props) {
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

  return (
    <div className="file-grid">
      {files.map((file) => (
        <FileCard
          key={file.id}
          file={file}
          onDelete={onDeleteFile}
          onMove={onMoveFile}
          onClick={onPreviewFile}
        />
      ))}
    </div>
  );
}
