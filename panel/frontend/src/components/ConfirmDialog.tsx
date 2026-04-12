import './ConfirmDialog.css';

interface Props {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ message, onConfirm, onCancel }: Props) {
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
        <p className="dialog-message">{message}</p>
        <div className="dialog-actions">
          <button className="dialog-cancel" onClick={onCancel}>Cancelar</button>
          <button className="dialog-confirm" onClick={onConfirm}>Eliminar</button>
        </div>
      </div>
    </div>
  );
}
