import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import ProductCard from '../components/ProductCard';
import { FILTER_CHIPS, buildListQuery, pendientesLabel } from '../lib/filters';
import { getCounts, getProducts } from '../services/api';
import type { Counts, ProductSummary, UiFilter } from '../types';

export default function ListPage({ archive = false }: { archive?: boolean }) {
  const [filter, setFilter] = useState<UiFilter>('todos');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [products, setProducts] = useState<ProductSummary[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getProducts(buildListQuery({ filter, q, archive }))
      .then((p) => !cancelled && setProducts(p))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [filter, q, archive]);

  useEffect(() => {
    if (archive) return;
    getCounts().then(setCounts).catch(() => setCounts(null));
  }, [archive]);

  return (
    <div className="page">
      <AppHeader title={archive ? 'Publicados' : 'Vine Reseñas'} backTo={archive ? '/' : undefined} />
      <main className="content">
        {!archive && (
          <div className="summary">
            <strong>{counts ? pendientesLabel(counts.pendientes) : ' '}</strong>
            <Link to="/publicados" className="link">
              Publicados{counts ? ` (${counts.publicado})` : ''}
            </Link>
          </div>
        )}
        <input
          type="search"
          className="input"
          placeholder="Buscar por título o ASIN"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar"
        />
        {!archive && (
          <div className="chips" role="tablist" aria-label="Filtros">
            {FILTER_CHIPS.map((c) => (
              <button
                key={c.value}
                type="button"
                role="tab"
                aria-selected={filter === c.value}
                className={`chip${filter === c.value ? ' chip--on' : ''}`}
                onClick={() => setFilter(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
        {error && <p className="error">{error}</p>}
        {products === null && !error && <p className="muted">Cargando…</p>}
        {products?.length === 0 && <p className="muted">No hay productos.</p>}
        <div className="cards">
          {products?.map((p) => <ProductCard key={p.asin} product={p} />)}
        </div>
      </main>
    </div>
  );
}
