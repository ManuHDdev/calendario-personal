import type { CorridorListing, RouteSearchResult } from '../types';

interface Props {
  result: RouteSearchResult | null;
  /** The detour the user asked for, which is what results are promised against. */
  maxDetourKm: number;
  selected: CorridorListing | null;
  onSelect: (listing: CorridorListing) => void;
  searching: boolean;
}

function formatPrice(listing: CorridorListing): string {
  if (listing.price === null) return 'A convenir';
  const symbol = listing.currency === 'EUR' ? '€' : ` ${listing.currency}`;
  return `${listing.price.toFixed(0)}${symbol}`;
}

export default function ResultsPanel({
  result,
  maxDetourKm,
  selected,
  onSelect,
  searching,
}: Props) {
  if (searching) {
    return (
      <div className="ruta-results ruta-results--empty">
        <p>Recorriendo la ruta y consultando Wallapop en cada tramo…</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="ruta-results ruta-results--empty">
        <p>Define un trayecto y qué buscas para empezar.</p>
      </div>
    );
  }

  const { stats, plan, route, listings } = result;

  return (
    <div className="ruta-results">
      <div className="ruta-results__summary">
        <p>
          <strong>{stats.matched}</strong>{' '}
          {stats.matched === 1 ? 'anuncio' : 'anuncios'} a menos de{' '}
          <strong>{maxDetourKm} km</strong> de desvío
        </p>
        <p className="ruta-results__meta">
          Ruta de {route.distanceKm} km · {Math.floor(route.durationMin / 60)} h{' '}
          {route.durationMin % 60} min · {plan.centers.length} puntos de búsqueda de{' '}
          {plan.radiusKm} km de radio
        </p>
        <p className="ruta-results__meta">
          {stats.fetched} anuncios revisados, {stats.matched} dentro del corredor.
        </p>

        {/* Coverage caveats are stated rather than glossed over: a silent
            partial search would look identical to a complete one. */}
        {stats.failedRequests > 0 && (
          <p className="ruta-results__warning">
            {stats.failedRequests} de {stats.requests} consultas fallaron: puede faltar algún
            anuncio en esos tramos.
          </p>
        )}
        {!plan.fullCoverage && (
          <p className="ruta-results__warning">
            El desvío pedido es mayor que el radio máximo disponible: la cobertura del corredor no
            está garantizada.
          </p>
        )}
      </div>

      {listings.length === 0 ? (
        <p className="ruta-results__none">
          Nada por el camino. Prueba a ampliar el desvío o a soltar el filtro de precio.
        </p>
      ) : (
        <ul className="ruta-results__list">
          {listings.map((listing) => (
            <li key={listing.external_id}>
              <button
                type="button"
                className={`ruta-card${
                  selected?.external_id === listing.external_id ? ' ruta-card--selected' : ''
                }`}
                onClick={() => onSelect(listing)}
              >
                {listing.image_url ? (
                  <img src={listing.image_url} alt="" loading="lazy" />
                ) : (
                  <span className="ruta-card__noimage" aria-hidden="true" />
                )}
                <span className="ruta-card__body">
                  <span className="ruta-card__title">{listing.title}</span>
                  <span className="ruta-card__price">{formatPrice(listing)}</span>
                  <span className="ruta-card__meta">
                    {listing.desvio_km.toFixed(1)} km de desvío · km{' '}
                    {listing.progreso_km.toFixed(0)} del viaje
                  </span>
                  <span className="ruta-card__meta">{listing.location}</span>
                </span>
              </button>
              <a
                className="ruta-card__link"
                href={listing.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir en Wallapop ↗
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
