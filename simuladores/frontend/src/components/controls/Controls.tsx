import { useId, type ReactNode } from 'react';
import './Controls.css';

interface ButtonProps {
  children: ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
}

export function Button({ children, onClick, variant = 'secondary', disabled, title, ariaLabel }: ButtonProps) {
  return (
    <button
      type="button"
      className={`ctl-btn ctl-btn--${variant}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

export function PlayPauseButton({ playing, onToggle }: { playing: boolean; onToggle: () => void }) {
  return (
    <Button variant="primary" onClick={onToggle} ariaLabel={playing ? 'Pausar' : 'Reproducir'}>
      {playing ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <rect x="5" y="4" width="5" height="16" rx="1.5" />
          <rect x="14" y="4" width="5" height="16" rx="1.5" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />
        </svg>
      )}
      <span>{playing ? 'Pausa' : 'Reproducir'}</span>
    </Button>
  );
}

export function StepButton({ onClick, label = 'Paso', disabled }: { onClick: () => void; label?: string; disabled?: boolean }) {
  return (
    <Button onClick={onClick} disabled={disabled} title="Avanzar un paso">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M5 5.5v13a1 1 0 0 0 1.55.83l9-6.5a1 1 0 0 0 0-1.66l-9-6.5A1 1 0 0 0 5 5.5z" />
        <rect x="17" y="5" width="3" height="14" rx="1" />
      </svg>
      <span>{label}</span>
    </Button>
  );
}

export function ResetButton({ onClick, label = 'Reiniciar' }: { onClick: () => void; label?: string }) {
  return (
    <Button onClick={onClick} variant="ghost" title={label}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <polyline points="3 3 3 9 9 9" />
      </svg>
      <span>{label}</span>
    </Button>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: string;
  disabled?: boolean;
}

export function Slider({ label, value, min, max, step = 1, onChange, format = String, hint, disabled }: SliderProps) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={`ctl-slider${disabled ? ' ctl-slider--disabled' : ''}`}>
      <div className="ctl-slider-head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="num">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--fill' as string]: `${pct}%` }}
      />
      {hint && <p className="ctl-hint">{hint}</p>}
    </div>
  );
}

interface SegmentedProps<T extends string | number> {
  label?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}

export function Segmented<T extends string | number>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="ctl-seg-wrap">
      {label && <span className="ctl-seg-label">{label}</span>}
      <div className="ctl-seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={`ctl-seg-opt${o.value === value ? ' ctl-seg-opt--on' : ''}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export const SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

export function SpeedControl({ value, onChange, speeds = SPEEDS as readonly number[] }: { value: number; onChange: (v: number) => void; speeds?: readonly number[] }) {
  return (
    <Segmented
      label="Velocidad"
      value={value}
      onChange={onChange}
      options={speeds.map((s) => ({ value: s, label: `${s.toLocaleString('es-ES')}×` }))}
    />
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="ctl-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="ctl-toggle-track" aria-hidden>
        <span className="ctl-toggle-thumb" />
      </span>
      <span>{label}</span>
    </label>
  );
}

export function ControlRow({ children }: { children: ReactNode }) {
  return <div className="ctl-row">{children}</div>;
}

interface StatProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  color?: string;
}

export function Stat({ label, value, sub, color }: StatProps) {
  return (
    <div className="ctl-stat">
      <span className="ctl-stat-label">
        {color && <span className="ctl-stat-dot" style={{ background: color }} />}
        {label}
      </span>
      <span className="ctl-stat-value num">{value}</span>
      {sub && <span className="ctl-stat-sub num">{sub}</span>}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="ctl-stats">{children}</div>;
}
