import './BulkActionBar.css';

interface Props {
  count: number;
  onShare: () => void;
  onMove: () => void;
  onDelete: () => void;
  onCancel: () => void;
}

export default function BulkActionBar({ count, onShare, onMove, onDelete, onCancel }: Props) {
  return (
    <div className="bulk-bar">
      <span className="bulk-bar-count">{count} seleccionado{count !== 1 ? 's' : ''}</span>

      <div className="bulk-bar-actions">
        <button className="bulk-bar-btn" onClick={onShare}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.6" y1="10.6" x2="15.4" y2="6.4"/><line x1="8.6" y1="13.4" x2="15.4" y2="17.6"/>
          </svg>
          Compartir
        </button>
        <button className="bulk-bar-btn" onClick={onMove}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <line x1="12" y1="11" x2="12" y2="17"/>
            <polyline points="9 14 12 17 15 14"/>
          </svg>
          Mover
        </button>
        <button className="bulk-bar-btn bulk-bar-btn--danger" onClick={onDelete}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
          Eliminar
        </button>
      </div>

      <button className="bulk-bar-cancel" onClick={onCancel} title="Cancelar selección">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}
