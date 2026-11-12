import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '../types';

// If any guest code imported keycloak, this mock would be touched and the "never logs in" test would fail.
const kc = vi.hoisted(() => ({ init: vi.fn(), login: vi.fn(), updateToken: vi.fn(), token: undefined, tokenParsed: {} }));
vi.mock('../services/keycloak', () => ({ default: kc }));

vi.mock('../services/guestApi', async (orig) => {
  const real = await orig<typeof import('../services/guestApi')>();
  return {
    ...real,
    getGuestView: vi.fn(),
    saveGuestFeedback: vi.fn().mockResolvedValue(undefined),
    deleteGuestMedia: vi.fn().mockResolvedValue(undefined),
    uploadGuestMedia: vi.fn().mockResolvedValue(undefined),
  };
});
vi.mock('../services/api', () => ({
  withToken: (u: string | null) => u ?? '',
  saveContent: vi.fn().mockResolvedValue({}),
  markListo: vi.fn(),
  markEspera: vi.fn().mockResolvedValue({}),
  markReanudar: vi.fn().mockResolvedValue({}),
  markPublicado: vi.fn(),
  uploadMedia: vi.fn(),
  deleteMedia: vi.fn(),
  getProduct: vi.fn(),
  getProducts: vi.fn(),
  getCounts: vi.fn(),
  listGuestLinks: vi.fn(),
  createGuestLink: vi.fn(),
  revokeGuestLink: vi.fn().mockResolvedValue(undefined),
}));

import GuestLinks, { whatsappHref } from '../components/GuestLinks';
import * as api from '../services/api';
import * as guest from '../services/guestApi';
import { DetailBody } from './DetailPage';
import GuestPage from './GuestPage';

const TOKEN = 'A'.repeat(43);
const view = (over = {}) => ({
  titulo: 'Cable USB',
  thumbnail_url: null,
  feedback: 'Va bien',
  media: [{ filename: '1-a.jpg', type: 'photo' as const, size: 3, url: `/vine-resenas/api/guest/${TOKEN}/media/1-a.jpg` }],
  limits: { maxFiles: 30, used: 1 },
  expiresAt: '2030-01-01T00:00:00Z',
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('guest path helpers', () => {
  it('extracts the token only from /vine-resenas/c/<token>', () => {
    expect(guest.tokenFromPath(`/vine-resenas/c/${TOKEN}`)).toBe(TOKEN);
    expect(guest.tokenFromPath(`/vine-resenas/c/${TOKEN}/`)).toBe(TOKEN);
    expect(guest.tokenFromPath('/vine-resenas/c/')).toBeNull();
    expect(guest.tokenFromPath('/vine-resenas/p/B0TEST')).toBeNull();
    expect(guest.isGuestPath(`/vine-resenas/c/${TOKEN}`)).toBe(true);
    expect(guest.isGuestPath('/vine-resenas/')).toBe(false);
  });
});

describe('GuestPage', () => {
  it('renders the product and the guest uploads without ever touching Keycloak', async () => {
    vi.mocked(guest.getGuestView).mockResolvedValue(view());
    render(<GuestPage token={TOKEN} />);
    expect(await screen.findByRole('heading', { name: 'Cable USB' })).toBeInTheDocument();
    expect(screen.getByLabelText('Tu opinión')).toHaveValue('Va bien');
    expect(screen.getByRole('button', { name: 'Quitar archivo' })).toBeInTheDocument();
    expect(kc.init).not.toHaveBeenCalled();
    expect(kc.login).not.toHaveBeenCalled();
    expect(kc.updateToken).not.toHaveBeenCalled();
  });

  it('shows the same invalid-link state for 404', async () => {
    vi.mocked(guest.getGuestView).mockRejectedValue(new guest.GuestApiError(404, 'x'));
    render(<GuestPage token={TOKEN} />);
    expect(await screen.findByText('Enlace no válido')).toBeInTheDocument();
    expect(kc.login).not.toHaveBeenCalled();
  });

  it('shows the closed state for 410 and the invalid state with no token', async () => {
    vi.mocked(guest.getGuestView).mockRejectedValue(new guest.GuestApiError(410, 'x'));
    const { unmount } = render(<GuestPage token={TOKEN} />);
    expect(await screen.findByText('Gracias')).toBeInTheDocument();
    unmount();
    render(<GuestPage token={null} />);
    expect(await screen.findByText('Enlace no válido')).toBeInTheDocument();
  });

  it('saves with the Save button and deletes a file after confirming', async () => {
    vi.mocked(guest.getGuestView).mockResolvedValue(view());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<GuestPage token={TOKEN} />);
    const box = await screen.findByLabelText('Tu opinión');
    await userEvent.type(box, '!');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(guest.saveGuestFeedback).toHaveBeenCalledWith(TOKEN, 'Va bien!'));
    await userEvent.click(screen.getByRole('button', { name: 'Quitar archivo' }));
    await waitFor(() => expect(guest.deleteGuestMedia).toHaveBeenCalledWith(TOKEN, '1-a.jpg'));
  });

  it('disables the picker when the file cap is reached', async () => {
    vi.mocked(guest.getGuestView).mockResolvedValue(view({ limits: { maxFiles: 30, used: 30 } }));
    render(<GuestPage token={TOKEN} />);
    expect(await screen.findByRole('button', { name: 'Añadir fotos o vídeo' })).toBeDisabled();
  });
});

describe('owner section', () => {
  const product = (over: Partial<Product> = {}): Product => ({
    asin: 'B0TEST', titulo: 'Cable', descripcion: '', feedback: 'mio', guest_feedback: 'de la tia', estrellas: 4,
    estado: 'pendiente', resena_producto: '', resena_resumida: '', resena_extendida: '', created_at: '', updated_at: '',
    media: [{ id: 1, filename: 'g.jpg', type: 'photo', size: 1, created_at: '', url: '/x/g.jpg', uploaded_by_guest: true }],
    ...over,
  });
  const renderBody = (p: Product, canWrite: boolean) =>
    render(
      <MemoryRouter>
        <DetailBody product={p} canWrite={canWrite} reload={vi.fn().mockResolvedValue(undefined)} />
      </MemoryRouter>,
    );

  it('writers get the guest link section; read-only users do not, but see guest data', async () => {
    vi.mocked(api.listGuestLinks).mockResolvedValue([]);
    const { unmount } = renderBody(product(), true);
    expect(await screen.findByRole('button', { name: 'Generar enlace' })).toBeInTheDocument();
    expect(screen.getByText('de la tia')).toBeInTheDocument();
    expect(screen.getByText('Familiar')).toBeInTheDocument();
    unmount();
    renderBody(product(), false);
    expect(screen.queryByRole('button', { name: 'Generar enlace' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Añadir a mi feedback' })).toBeNull();
    expect(screen.getByText('de la tia')).toBeInTheDocument();
    expect(api.listGuestLinks).toHaveBeenCalledTimes(1);
  });

  it('appends the guest feedback to the owner feedback', async () => {
    vi.mocked(api.listGuestLinks).mockResolvedValue([]);
    renderBody(product(), true);
    await userEvent.click(await screen.findByRole('button', { name: 'Añadir a mi feedback' }));
    expect(screen.getByLabelText('Feedback')).toHaveValue('mio\n\nde la tia');
  });

  it('published products show no link section', () => {
    renderBody(product({ estado: 'publicado' }), true);
    expect(screen.queryByRole('button', { name: 'Generar enlace' })).toBeNull();
  });
});

describe('GuestLinks', () => {
  const info = (id: number, status: 'active' | 'expired' | 'revoked') => ({
    id, createdAt: '2026-01-01T00:00:00Z', expiresAt: '2026-01-15T00:00:00Z', revokedAt: null, lastUsedAt: null, status,
  });

  it('creates a link, shows the absolute url once and builds a wa.me link', async () => {
    vi.mocked(api.listGuestLinks).mockResolvedValue([]);
    vi.mocked(api.createGuestLink).mockResolvedValue({ id: 1, url: `/vine-resenas/c/${TOKEN}`, token: TOKEN, expiresAt: '2026-01-15T00:00:00Z' });
    render(<GuestLinks asin="B0TEST" titulo="Cable" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Generar enlace' }));
    const field = await screen.findByLabelText('Enlace generado');
    expect(field).toHaveValue(`${window.location.origin}/vine-resenas/c/${TOKEN}`);
    const wa = screen.getByRole('link', { name: 'WhatsApp' });
    expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(decodeURIComponent(wa.getAttribute('href')!)).toContain(TOKEN);
  });

  it('lists links with status and revokes only active ones after confirming', async () => {
    vi.mocked(api.listGuestLinks).mockResolvedValue([info(2, 'active'), info(1, 'revoked')]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<GuestLinks asin="B0TEST" />);
    expect(await screen.findByText('Revocado')).toBeInTheDocument();
    const revokes = screen.getAllByRole('button', { name: 'Revocar' });
    expect(revokes).toHaveLength(1);
    await userEvent.click(revokes[0]);
    await waitFor(() => expect(api.revokeGuestLink).toHaveBeenCalledWith(2));
  });

  it('whatsappHref encodes the message', () => {
    expect(whatsappHref('https://x/c/t', 'A & B')).toBe(
      `https://wa.me/?text=${encodeURIComponent('Hola, ¿me ayudas con tu opinión sobre "A & B"? https://x/c/t')}`,
    );
  });
});
