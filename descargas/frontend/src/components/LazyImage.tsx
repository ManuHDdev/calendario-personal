import { useEffect, useRef, useState } from 'react';
import { fileUrl, thumbUrl } from '../services/api';
import FileIcon from './FileIcon';

interface Props {
  path: string;
  alt: string;
}

type Stage = 'thumb' | 'original' | 'failed';

/**
 * Thumbnail that only requests the image once it is near the viewport. The URL
 * (and therefore the access token inside it) is built at that moment, so a
 * thumbnail scrolled into view minutes later does not carry a stale token.
 *
 * It asks the server for a small WebP (`/thumb`); if that fails (unsupported
 * format, corrupt file...) it falls back once to the original, and only shows
 * the placeholder icon if that fails too. The parent box has a fixed
 * aspect-ratio (see DescargasPage.css), so nothing shifts while images load.
 */
export default function LazyImage({ path, alt }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('thumb');

  useEffect(() => {
    setSrc(null);
    setStage('thumb');
    const node = holder.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSrc(thumbUrl(path));
      return;
    }
    const observer = new IntersectionObserver(
      (items) => {
        if (items.some((i) => i.isIntersecting)) {
          setSrc(thumbUrl(path));
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [path]);

  const onError = () => {
    if (stage === 'thumb') {
      setStage('original');
      setSrc(fileUrl(path));
    } else {
      setStage('failed');
    }
  };

  return (
    <div className="lazy-image" ref={holder}>
      {src && stage !== 'failed' ? (
        <img src={src} alt={alt} decoding="async" onError={onError} />
      ) : (
        <span className="lazy-image-placeholder">
          <FileIcon kind="image" size={32} />
        </span>
      )}
    </div>
  );
}
