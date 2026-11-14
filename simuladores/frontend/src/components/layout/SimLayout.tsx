import type { ReactNode } from 'react';
import './SimLayout.css';

interface SimPageProps {
  title: string;
  lead: ReactNode;
  children: ReactNode;
}

/** Page wrapper for a simulator: heading + lead paragraph + content. */
export function SimPage({ title, lead, children }: SimPageProps) {
  return (
    <article className="sim-page">
      <header className="sim-page-head">
        <h1>{title}</h1>
        <p>{lead}</p>
      </header>
      {children}
    </article>
  );
}

/** Stage on the left, side column (controls, stats) on the right; stacks on narrow screens. */
export function SimMain({ stage, side }: { stage: ReactNode; side: ReactNode }) {
  return (
    <div className="sim-main">
      <div className="sim-stage-col">{stage}</div>
      <aside className="sim-side">{side}</aside>
    </div>
  );
}

interface PanelProps {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}

export function Panel({ title, actions, children, className = '', flush = false }: PanelProps) {
  return (
    <section className={`sim-panel${flush ? ' sim-panel--flush' : ''} ${className}`}>
      {(title || actions) && (
        <div className="sim-panel-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="sim-panel-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function ChartGrid({ children }: { children: ReactNode }) {
  return <div className="sim-charts">{children}</div>;
}

/** The "¿Qué está pasando?" explanation box. */
export function Explanation({ children }: { children: ReactNode }) {
  return (
    <section className="sim-panel sim-explain">
      <h2>¿Qué está pasando?</h2>
      <div className="sim-explain-body">{children}</div>
    </section>
  );
}

/** Canvas inside a rounded stage with a fixed aspect ratio. */
export function Stage({
  canvasRef,
  aspect = '1 / 1',
  maxHeight,
  label,
  overlay,
  onPointerDown,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  aspect?: string;
  maxHeight?: string;
  label: string;
  overlay?: ReactNode;
  onPointerDown?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
}) {
  return (
    <div className="sim-stage" style={{ aspectRatio: aspect, maxHeight }}>
      <canvas ref={canvasRef} role="img" aria-label={label} onPointerDown={onPointerDown} />
      {overlay && <div className="sim-stage-overlay">{overlay}</div>}
    </div>
  );
}
