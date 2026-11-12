import { useCallback, useEffect, useRef, useState } from 'react';
import { useAutosave } from '../hooks/useAutosave';
import { compressImage } from '../lib/compress';
import {
  GuestApiError,
  deleteGuestMedia,
  getGuestView,
  saveGuestFeedback,
  uploadGuestMedia,
} from '../services/guestApi';
import type { GuestView } from '../types';

const STATUS_TEXT = { idle: '', saving: 'Guardando…', saved: 'Guardado', error: 'No se pudo guardar' } as const;

interface UploadItem {
  id: number;
  name: string;
  progress: number;
  error?: string;
}
let nextId = 1;

export function GuestState({ title, text }: { title: string; text: string }) {
  return (
    <div className="guest-state">
      <h1>{title}</h1>
      <p className="muted">{text}</p>
    </div>
  );
}

/** Public page for a relative: no Keycloak, the token in the URL is the only credential. */
export default function GuestPage({ token }: { token: string | null }) {
  const [view, setView] = useState<GuestView | null>(null);
  const [failure, setFailure] = useState<GuestApiError | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setFailure(new GuestApiError(404, 'invalid'));
      return;
    }
    try {
      setView(await getGuestView(token));
      setFailure(null);
    } catch (e) {
      setFailure(e instanceof GuestApiError ? e : new GuestApiError(0, 'network'));
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (failure && !view) {
    if (failure.status === 410) {
      return <GuestState title="Gracias" text="Este producto ya está cerrado y no admite más cambios." />;
    }
    if (failure.status === 429) {
      return <GuestState title="Demasiados intentos" text="Espera unos minutos y vuelve a abrir el enlace." />;
    }
    if (failure.status === 404) {
      return (
        <GuestState
          title="Enlace no válido"
          text="Este enlace no existe, ha caducado o ha sido desactivado. Pídele uno nuevo a quien te lo envió."
        />
      );
    }
    return (
      <div className="guest-state">
        <h1>No se pudo cargar</h1>
        <p className="muted">Comprueba tu conexión e inténtalo otra vez.</p>
        <button type="button" className="btn btn--primary" onClick={() => void load()}>
          Reintentar
        </button>
      </div>
    );
  }
  if (!view || !token) return <p className="muted guest-state">Cargando…</p>;
  return <GuestBody token={token} view={view} reload={load} />;
}

export function GuestBody({ token, view, reload }: { token: string; view: GuestView; reload: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(view.feedback);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { status, flush } = useAutosave(text, (v) => saveGuestFeedback(token, v), { delay: 1000 });

  const patch = (id: number, p: Partial<UploadItem>) =>
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...p } : i)));

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const queue = Array.from(files).map((f) => ({ id: nextId++, file: f }));
    if (input.current) input.current.value = '';
    setError(null);
    setItems(queue.map((q) => ({ id: q.id, name: q.file.name, progress: 0 })));
    for (const q of queue) {
      try {
        const file = await compressImage(q.file);
        await uploadGuestMedia(token, file, (f) => patch(q.id, { progress: f }));
        patch(q.id, { progress: 1 });
      } catch (e) {
        patch(q.id, { error: e instanceof Error ? e.message : 'Error al subir' });
      }
    }
    await reload();
    setTimeout(() => setItems((cur) => cur.filter((i) => i.error)), 1500);
  };

  const remove = async (filename: string) => {
    if (!window.confirm('¿Quitar este archivo?')) return;
    setError(null);
    try {
      await deleteGuestMedia(token, filename);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar');
    }
  };

  const full = view.limits.used >= view.limits.maxFiles;

  return (
    <main className="guest-page">
      <header>
        <h1>{view.titulo}</h1>
        <p className="muted">Cuéntanos qué te ha parecido y, si quieres, sube fotos o un vídeo.</p>
      </header>

      {view.thumbnail_url && <img className="guest-page__cover" src={view.thumbnail_url} alt="" />}

      <section>
        <h2 className="section-title">
          Tu opinión <span className={`save-status save-status--${status}`}>{STATUS_TEXT[status]}</span>
        </h2>
        <textarea
          className="input textarea"
          rows={7}
          maxLength={5000}
          value={text}
          placeholder="Escribe aquí lo que piensas del producto"
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void flush()}
          aria-label="Tu opinión"
        />
        <button type="button" className="btn btn--block" onClick={() => void flush()}>
          Guardar
        </button>
      </section>

      <section>
        <h2 className="section-title">Fotos y vídeo</h2>
        {view.media.length === 0 && <p className="muted">Todavía no has subido nada.</p>}
        <div className="gallery__grid">
          {view.media.map((m) => (
            <div key={m.filename} className="gallery__item">
              {m.type === 'photo' ? (
                <img src={m.url} alt="" loading="lazy" />
              ) : (
                <video src={m.url} controls preload="metadata" playsInline />
              )}
              <button type="button" className="gallery__del" aria-label="Quitar archivo" onClick={() => void remove(m.filename)}>
                {'×'}
              </button>
            </div>
          ))}
        </div>
        {items.length > 0 && (
          <ul className="uploads">
            {items.map((i) => (
              <li key={i.id}>
                <span className="uploads__name">{i.name}</span>
                {i.error ? <span className="error">{i.error}</span> : <progress max={1} value={i.progress} aria-label={`Subiendo ${i.name}`} />}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <input ref={input} type="file" multiple accept="image/*,video/*" hidden onChange={(e) => void handleFiles(e.target.files)} />
        <button type="button" className="btn btn--primary btn--block" disabled={full} onClick={() => input.current?.click()}>
          Añadir fotos o vídeo
        </button>
        <p className="muted small">
          {full ? 'Has llegado al máximo de archivos.' : 'Solo se admite un vídeo; si subes otro, reemplaza al tuyo anterior.'}
        </p>
      </section>
    </main>
  );
}
