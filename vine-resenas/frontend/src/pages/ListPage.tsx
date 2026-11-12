import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import ProductCard from '../components/ProductCard';
import { FILTER_CHIPS, buildListQuery, pendientesLabel } from '../lib/filters';
import { FILTRO_PARAM, SEARCH_PARAM, parseFiltro, takeScroll, withFiltro } from '../lib/listState';
import { getCounts, getProducts } from '../services/api';
import type { Counts, ProductSummary, UiFilter } from '../types';

/**
 * The active tab and the search live in the URL (`/?filtro=listos&q=cable`), so Back/Forward restore them,
 * a link can be shared, and the detail page can return to exactly this view.
 */
export default function ListPage({ archive = false }: { archive?: boolean }) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const filter: UiFilter = parseFiltro(params.get(FILTRO_PARAM));
  const q = params.get(SEARCH_PARAM) ?? '';

  const [search, setSearch] = useState(q);
  const [products, setProducts] = useState<ProductSummary[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRestored = useRef(false);

  // URL -> input (Back/Forward changes q from outside).
  useEffect(() => {
    setSearch(q);
  }, [q]);

  // input -> URL, debounced; replace so typing does not fill the history.
  useEffect(() => {
    if (search === q) return;
    const t = setTimeout(() => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (search.trim()) next.set(SEARCH_PARAM, search);
          else next.delete(SEARCH_PARAM);
          return next;
        },
        { replace: true },
      );
    }, 300);
    return () => clearTimeout(t);
  }, [search, q, setParams]);

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

  // Coming back from a detail page: put the scroll where it was, once the cards exist.
  useEffect(() => {
    if (products === null || scrollRestored.current) return;
    scrollRestored.current = true;
    const y = takeScroll(`${location.pathname}${location.search}`);
    if (y !== null) requestAnimationFrame(() => window.scrollTo(0, y));
  }, [products, location.pathname, location.search]);

  const chipLabel = (value: UiFilter, label: string) =>
    value === 'en_espera' && counts ? `${label} (${counts.en_espera})` : label;

  return (
    <div className="page">
      <AppHeader title={archive ? 'Publicados' : 'Vine Reseñas'} backTo={archive ? '/' : undefined} />
      <main className="content">
        {!archive && (
          <div className="summary">
            <strong>{counts ? pendientesLabel(counts.pendientes) : ' '}</strong>
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
                onClick={() => setParams(withFiltro(params, c.value))}
              >
                {chipLabel(c.value, c.label)}
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
