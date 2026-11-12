import { useCallback, useEffect, useState } from 'react';
import { copyText } from '../lib/clipboard';
import { createGuestLink, listGuestLinks, revokeGuestLink } from '../services/api';
import type { CreatedGuestLink, GuestLinkInfo } from '../types';

const STATUS_TEXT = { active: 'Activo', expired: 'Caducado', revoked: 'Revocado' } as const;

export function whatsappHref(url: string, titulo?: string): string {
  const text = `${titulo ? `Hola, ¿me ayudas con tu opinión sobre "${titulo}"? ` : 'Hola, ¿me ayudas con tu opinión? '}${url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function fmt(date: string): string {
  return new Date(date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

/** Owner-only section: create/copy/share/revoke the guest link of one product. Rendered for writers only. */
export default function GuestLinks({ asin, titulo }: { asin: string; titulo?: string }) {
  const [links, setLinks] = useState<GuestLinkInfo[]>([]);
  // The raw token only exists right after creation (the server keeps just its hash).
  const [fresh, setFresh] = useState<(CreatedGuestLink & { absolute: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reload = useCallback(async () => {
    try {
      setLinks((await listGuestLinks(asin)) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }, [asin]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const l = await createGuestLink(asin);
      setFresh({ ...l, absolute: `${window.location.origin}${l.url}` });
      setCopied(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el enlace');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (l: GuestLinkInfo) => {
    if (!window.confirm('¿Revocar este enlace? Quien lo tenga dejará de poder usarlo.')) return;
    setError(null);
    try {
      await revokeGuestLink(l.id);
      if (fresh?.id === l.id) setFresh(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo revocar');
    }
  };

  const copy = async () => {
    if (!fresh) return;
    setCopied(await copyText(fresh.absolute));
  };

  const share = async () => {
    if (!fresh) return;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: titulo, url: fresh.absolute });
        return;
      } catch {
        /* cancelled or unsupported: fall back to WhatsApp */
      }
    }
    window.open(whatsappHref(fresh.absolute, titulo), '_blank', 'noopener');
  };

  return (
    <section className="guest-links">
      <h2 className="section-title">Enlace para familiar</h2>
      <p className="muted small">
        Genera un enlace para que alguien sin cuenta escriba su opinión y suba fotos o vídeo de este producto.
      </p>
      <button type="button" className="btn" disabled={busy} onClick={() => void create()}>
        Generar enlace
      </button>

      {fresh && (
        <div className="guest-links__new">
          <p className="notice small">Cópialo ahora: por seguridad no se vuelve a mostrar.</p>
          <input className="input guest-links__url" readOnly value={fresh.absolute} aria-label="Enlace generado" onFocus={(e) => e.target.select()} />
          <div className="guest-links__actions">
            <button type="button" className="btn btn--small" onClick={() => void copy()}>
              {copied ? 'Enlace copiado' : 'Copiar enlace'}
            </button>
            <button type="button" className="btn btn--small" onClick={() => void share()}>
              Compartir
            </button>
            <a className="btn btn--small" href={whatsappHref(fresh.absolute, titulo)} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
          </div>
          <p className="muted small">Caduca el {fmt(fresh.expiresAt)}.</p>
        </div>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      {links.length > 0 && (
        <ul className="guest-links__list">
          {links.map((l) => (
            <li key={l.id}>
              <span>
                <span className={`badge ${l.status === 'active' ? 'badge--ok' : 'badge--warn'}`}>{STATUS_TEXT[l.status]}</span>{' '}
                Creado {fmt(l.createdAt)} · caduca {fmt(l.expiresAt)}
                {l.lastUsedAt ? ` · usado ${fmt(l.lastUsedAt)}` : ' · sin usar'}
              </span>
              {l.status === 'active' && (
                <button type="button" className="btn btn--small" onClick={() => void revoke(l)}>
                  Revocar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
