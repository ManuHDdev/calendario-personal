import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import CopyField from '../components/CopyField';
import GuestLinks from '../components/GuestLinks';
import MediaGallery from '../components/MediaGallery';
import StarSelector from '../components/StarSelector';
import { useAutosave } from '../hooks/useAutosave';
import { ESTADO_LABEL } from '../lib/filters';
import { getProduct, markListo, markPublicado, saveContent } from '../services/api';
import type { Product } from '../types';

interface BodyProps {
  product: Product;
  canWrite: boolean;
  reload: () => Promise<void>;
}

const STATUS_TEXT = {
  idle: '',
  saving: 'Guardando…',
  saved: 'Guardado',
  error: 'Error al guardar',
} as const;

export function DetailBody({ product, canWrite, reload }: BodyProps) {
  const editable = canWrite && product.estado !== 'publicado';
  const [feedback, setFeedback] = useState(product.feedback);
  const [estrellas, setEstrellas] = useState<number | null>(product.estrellas);
  const [showDesc, setShowDesc] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { status, flush } = useAutosave(
    { feedback, estrellas },
    (v) => saveContent(product.asin, v).then(() => undefined),
    { delay: 800, enabled: editable },
  );

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      if (!(await flush())) throw new Error('No se pudo guardar el feedback');
      await fn();
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const { estado } = product;
  const showReview = estado === 'resena_generada' || estado === 'publicado';

  return (
    <>
      <main className="content content--detail">
        <div className="detail-head">
          <h2 className="detail-title">{product.titulo || product.asin}</h2>
          <p className="muted small">
            {product.asin} · <span className="badge badge--neutral">{ESTADO_LABEL[estado]}</span>
          </p>
          {product.descripcion && (
            <>
              <button type="button" className="link" onClick={() => setShowDesc((v) => !v)} aria-expanded={showDesc}>
                {showDesc ? 'Ocultar descripción' : 'Ver descripción'}
              </button>
              {showDesc && <p className="desc">{product.descripcion}</p>}
            </>
          )}
        </div>

        <MediaGallery asin={product.asin} media={product.media} canWrite={editable} onChanged={() => void reload()} />

        <section>
          <h2 className="section-title">
            Feedback <span className={`save-status save-status--${status}`}>{STATUS_TEXT[status]}</span>
          </h2>
          <textarea
            className="input textarea"
            rows={6}
            value={feedback}
            readOnly={!editable}
            placeholder={editable ? 'Escribe tu opinión del producto' : 'Sin feedback'}
            onChange={(e) => setFeedback(e.target.value)}
            onBlur={() => void flush()}
            aria-label="Feedback"
          />
          {product.guest_feedback && (
            <div className="guest-feedback">
              <h3 className="section-title">Opinión del familiar</h3>
              <p className="guest-feedback__text">{product.guest_feedback}</p>
              {editable && (
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={() => setFeedback((cur) => (cur.trim() ? `${cur.trimEnd()}

` : '') + product.guest_feedback)}
                >
                  Añadir a mi feedback
                </button>
              )}
            </div>
          )}
          <h2 className="section-title">Valoración</h2>
          <StarSelector value={estrellas} onChange={setEstrellas} disabled={!editable} />
        </section>

        {editable && <GuestLinks asin={product.asin} titulo={product.titulo} />}

        {showReview && (
          <section>
            <h2 className="section-title">Reseña generada</h2>
            <CopyField label="Reseña del producto" text={product.resena_producto} />
            <CopyField label="Reseña resumida" text={product.resena_resumida} />
            <CopyField label="Reseña extendida" text={product.resena_extendida} />
          </section>
        )}
        {actionError && <p className="error" role="alert">{actionError}</p>}
      </main>

      {canWrite && estado === 'pendiente' && (
        <div className="action-bar">
          <button type="button" className="btn btn--primary btn--block" disabled={busy} onClick={() => void act(() => markListo(product.asin))}>
            Marcar como listo
          </button>
        </div>
      )}
      {canWrite && estado === 'resena_generada' && (
        <div className="action-bar">
          <button type="button" className="btn btn--primary btn--block" disabled={busy} onClick={() => void act(() => markPublicado(product.asin))}>
            Marcar como publicado
          </button>
        </div>
      )}
    </>
  );
}

export default function DetailPage({ canWrite }: { canWrite: boolean }) {
  const { asin = '' } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setProduct(await getProduct(asin));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }, [asin]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="page">
      <AppHeader title="Producto" backTo="/" />
      {error && <p className="error content">{error}</p>}
      {!product && !error && <p className="muted content">Cargando…</p>}
      {product && <DetailBody key={product.asin} product={product} canWrite={canWrite} reload={reload} />}
    </div>
  );
}
