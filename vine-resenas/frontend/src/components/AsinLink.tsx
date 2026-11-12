import { amazonUrl } from '../lib/amazon';

/** ASIN that opens the Amazon.es product page in a new tab; plain text when the ASIN is malformed. */
export default function AsinLink({ asin, className }: { asin: string; className?: string }) {
  const href = amazonUrl(asin);
  if (!href) return <span className={className}>{asin}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? 'asin-link'}
      title="Ver en Amazon.es"
      onClick={(e) => e.stopPropagation()}
    >
      {asin}
    </a>
  );
}
