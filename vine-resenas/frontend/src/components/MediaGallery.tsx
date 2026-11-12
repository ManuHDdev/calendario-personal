import { useRef, useState } from 'react';
import { compressImage } from '../lib/compress';
import { checkFileSize } from '../lib/limits';
import { deleteMedia, uploadMedia, withToken } from '../services/api';
import type { Media } from '../types';

interface Props {
  asin: string;
  media: Media[];
  canWrite: boolean;
  onChanged: () => void;
}

interface UploadItem {
  id: number;
  name: string;
  progress: number;
  error?: string;
  done?: boolean;
}

let nextId = 1;

export default function MediaGallery({ asin, media, canWrite, onChanged }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patch = (id: number, p: Partial<UploadItem>) =>
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...p } : i)));

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    if (input.current) input.current.value = '';
    setNotice(null);
    const queue = list.map((f) => ({ id: nextId++, file: f }));
    setItems(queue.map((q) => ({ id: q.id, name: q.file.name, progress: 0 })));
    let replaced = false;
    for (const q of queue) {
      try {
        const file = await compressImage(q.file);
        const tooLarge = checkFileSize(file);
        if (tooLarge) throw new Error(tooLarge);
        const res = await uploadMedia(asin, file, (f) => patch(q.id, { progress: f }));
        if (res.replaced.length > 0) replaced = true;
        patch(q.id, { progress: 1, done: true });
      } catch (e) {
        patch(q.id, { error: e instanceof Error ? e.message : 'Error al subir' });
      }
    }
    if (replaced) setNotice('El vídeo anterior se ha reemplazado por el nuevo.');
    onChanged();
    setTimeout(() => setItems((cur) => cur.filter((i) => i.error)), 1500);
  };

  const remove = async (m: Media) => {
    if (!window.confirm('¿Eliminar este archivo?')) return;
    setError(null);
    try {
      await deleteMedia(asin, m.filename);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar');
    }
  };

  const hasVideo = media.some((m) => m.type === 'video');

  return (
    <section className="gallery">
      <h2 className="section-title">Fotos y vídeo</h2>
      {media.length === 0 && <p className="muted">Todavía no hay archivos.</p>}
      <div className="gallery__grid">
        {media.map((m) => (
          <div key={m.id} className="gallery__item">
            {m.type === 'photo' ? (
              <img src={withToken(m.url)} alt="" loading="lazy" />
            ) : (
              <video src={withToken(m.url)} controls preload="metadata" playsInline />
            )}
            {m.uploaded_by_guest && <span className="gallery__guest">Familiar</span>}
            {canWrite && (
              <button
                type="button"
                className="gallery__del"
                aria-label="Eliminar archivo"
                onClick={() => remove(m)}
              >
                {'×'}
              </button>
            )}
          </div>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      {items.length > 0 && (
        <ul className="uploads">
          {items.map((i) => (
            <li key={i.id}>
              <span className="uploads__name">{i.name}</span>
              {i.error ? (
                <span className="error">{i.error}</span>
              ) : (
                <progress max={1} value={i.progress} aria-label={`Subiendo ${i.name}`} />
              )}
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <>
          <input
            ref={input}
            type="file"
            multiple
            accept="image/*,video/*"
            hidden
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <button type="button" className="btn" onClick={() => input.current?.click()}>
            Añadir fotos o vídeo
          </button>
          <p className="muted small">
            {hasVideo ? 'Subir un vídeo nuevo reemplaza al actual. ' : 'Solo se admite un vídeo por producto. '}
            Límites: fotos 25 MB, vídeo 1 GB.
          </p>
        </>
      )}
    </section>
  );
}
