import { useState } from 'react';

interface Props {
  accessToken: string;
  onRotate: () => Promise<void>;
}

function shareUrl(accessToken: string): string {
  const local = window.location.hostname === 'localhost';
  const origin = local ? 'http://localhost:5182' : window.location.origin;
  return `${origin}/reparto/g/${accessToken}`;
}

/**
 * Solo alcanzable desde el flujo de gestor Keycloak — el token de sesión de
 * grupo nunca trae `accessToken` en la respuesta de `GET /groups/:id`
 * (spec.md "Shareable group access link"), así que este panel no puede
 * montarse en el flujo `/g/:token` (tasks.md 7.6).
 */
export default function ShareGroupPanel({ accessToken, onRotate }: Props) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState('');

  const url = shareUrl(accessToken);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('No se ha podido copiar automáticamente — cópialo a mano.');
    }
  };

  const handleRotate = async () => {
    setRotating(true);
    setError('');
    try {
      await onRotate();
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al regenerar el enlace');
    } finally {
      setRotating(false);
    }
  };

  return (
    <div className="share-panel">
      <p className="reparto-section-hint">
        Cualquiera con este enlace puede entrar al grupo sin cuenta, ver los gastos y añadir o editar los suyos.
      </p>
      <div className="share-link-row">
        <input type="text" readOnly value={url} className="share-link-input" onFocus={(e) => e.target.select()} />
        <button className="btn-secondary" onClick={handleCopy}>{copied ? 'Copiado ✓' : 'Copiar'}</button>
      </div>

      {error && <div className="expense-form-error">{error}</div>}

      {!confirming ? (
        <button className="btn-danger" onClick={() => setConfirming(true)}>Regenerar enlace</button>
      ) : (
        <div className="share-rotate-confirm">
          <p>
            Esto invalida el enlace actual — cualquiera que lo tenga guardado dejará de poder acceder al grupo.
            ¿Seguro?
          </p>
          <div className="expense-form-row">
            <button className="btn-danger" onClick={handleRotate} disabled={rotating}>
              {rotating ? 'Regenerando…' : 'Sí, regenerar'}
            </button>
            <button className="btn-secondary" onClick={() => setConfirming(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
