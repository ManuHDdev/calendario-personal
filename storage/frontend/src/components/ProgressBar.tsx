import './ProgressBar.css';

interface Props {
  value: number; // 0-100
  label?: string;
}

export default function ProgressBar({ value, label }: Props) {
  return (
    <div className="progress-bar-wrapper">
      {label && <span className="progress-label">{label}</span>}
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <span className="progress-pct">{value}%</span>
    </div>
  );
}
