import { useEffect, useRef, useState } from 'react';
import { fileUrl } from '../services/api';
import FileIcon from './FileIcon';

interface Props {
  path: string;
  alt: string;
}

/**
 * Thumbnail that only requests the image once it is near the viewport. The URL
 * (and therefore the access token inside it) is built at that moment, so a
 * thumbnail scrolled into view minutes later does not carry a stale token.
 */
export default function LazyImage({ path, alt }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const node = holder.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSrc(fileUrl(path));
      return;
    }
    const observer = new IntersectionObserver(
      (items) => {
        if (items.some((i) => i.isIntersecting)) {
          setSrc(fileUrl(path));
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [path]);

  return (
    <div className="lazy-image" ref={holder}>
      {src && !failed ? (
        <img src={src} alt={alt} decoding="async" onError={() => setFailed(true)} />
      ) : (
        <span className="lazy-image-placeholder">
          <FileIcon kind="image" size={32} />
        </span>
      )}
    </div>
  );
}
