import type { KeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { badgesFor } from '../lib/filters';
import { saveScroll } from '../lib/listState';
import { withToken } from '../services/api';
import type { ProductSummary } from '../types';
import AsinLink from './AsinLink';

export default function ProductCard({ product }: { product: ProductSummary }) {
  const navigate = useNavigate();
  const location = useLocation();
  // Where the list was (tab, search) so the detail page can return exactly there.
  const from = `${location.pathname}${location.search}`;

  const open = () => {
    saveScroll(from, window.scrollY);
    navigate(`/p/${encodeURIComponent(product.asin)}`, { state: { from } });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      open();
    }
  };

  return (
    <div className="card" role="link" tabIndex={0} onClick={open} onKeyDown={onKeyDown} aria-label={product.titulo || product.asin}>
      <div className="card__thumb">
        {product.thumbnail_url ? (
          <img src={withToken(product.thumbnail_url)} alt="" loading="lazy" />
        ) : (
          <span className="card__noimg">Sin foto</span>
        )}
      </div>
      <div className="card__body">
        <h2 className="card__title">{product.titulo || product.asin}</h2>
        <p className="card__asin">
          <AsinLink asin={product.asin} />
        </p>
        <div className="badges">
          {badgesFor(product).map((b) => (
            <span key={b.key} className={`badge badge--${b.tone}`}>
              {b.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
