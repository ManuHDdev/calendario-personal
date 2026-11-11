import { useEffect, useRef, useState } from 'react';
import { copyText } from '../lib/clipboard';

interface Props {
  label: string;
  text: string;
}

export default function CopyField({ label, text }: Props) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const handle = async () => {
    const ok = await copyText(text);
    setState(ok ? 'copied' : 'failed');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  };

  return (
    <section className="copy-field">
      <div className="copy-field__head">
        <h3>{label}</h3>
        <button type="button" className="btn btn--small" onClick={handle} disabled={!text}>
          {state === 'copied' ? 'Copiado' : state === 'failed' ? 'No se pudo copiar' : 'Copiar'}
        </button>
      </div>
      <p className="copy-field__text">{text || 'Sin contenido'}</p>
    </section>
  );
}
