import { useState } from 'react';
import type { FileItem } from '../types';
import './MoveModal.css';

interface Props {
  files: FileItem[];
  folders: string[];
  onMove: (targetFolder: string | null) => void;
  onCancel: () => void;
}

export default function MoveModal({ files, folders, onMove, onCancel }: Props) {
  const single = files.length === 1 ? files[0] : null;
  const [selected, setSelected] = useState<string | null>(single?.folder ?? null);

  return (
    <div className="move-overlay" onClick={onCancel}>
      <div className="move-box" onClick={(e) => e.stopPropagation()}>
        <div className="move-header">
          <span className="move-title">{single ? 'Mover archivo' : `Mover ${files.length} archivos`}</span>
          <button className="move-close" onClick={onCancel}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <p className="move-filename">
          {single ? `"${single.name}"` : files.map((f) => f.name).join(', ')}
        </p>

        <div className="move-list">
          {/* Opción raíz */}
          <button
            className={`move-option ${selected === null ? 'selected' : ''}`}
            onClick={() => setSelected(null)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            <span>Raíz (sin carpeta)</span>
            {selected === null && <span className="move-check">✓</span>}
          </button>

          {folders.map((folder) => {
            const depth = folder.split('/').length - 1;
            const name = folder.split('/').pop()!;
            return (
              <button
                key={folder}
                className={`move-option ${selected === folder ? 'selected' : ''}`}
                style={{ paddingLeft: `${14 + depth * 16}px` }}
                onClick={() => setSelected(folder)}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                </svg>
                <span>{name}</span>
                {selected === folder && <span className="move-check">✓</span>}
              </button>
            );
          })}
        </div>

        <div className="move-actions">
          <button className="move-btn-cancel" onClick={onCancel}>Cancelar</button>
          <button
            className="move-btn-confirm"
            onClick={() => onMove(selected)}
            disabled={single !== null && selected === single.folder}
          >
            Mover aquí
          </button>
        </div>
      </div>
    </div>
  );
}
