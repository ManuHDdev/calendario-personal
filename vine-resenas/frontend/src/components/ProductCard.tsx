import { Link } from 'react-router-dom';
import { badgesFor } from '../lib/filters';
import { withToken } from '../services/api';
import type { ProductSummary } from '../types';

export default function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <Link to={`/p/${encodeURIComponent(product.asin)}`} className="card">
      <div className="card__thumb">
        {product.thumbnail_url ? (
          <img src={withToken(product.thumbnail_url)} alt="" loading="lazy" />
        ) : (
          <span className="card__noimg">Sin foto</span>
        )}
      </div>
      <div className="card__body">
        <h2 className="card__title">{product.titulo || product.asin}</h2>
        <div className="badges">
          {badgesFor(product).map((b) => (
            <span key={b.key} className={`badge badge--${b.tone}`}>
              {b.label}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
