import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductSummary } from '../types';

vi.mock('../services/keycloak', () => ({ default: { token: 'tok', tokenParsed: {}, updateToken: vi.fn() } }));
// The header pulls in theme/launcher code that needs matchMedia; irrelevant here.
vi.mock('../components/AppHeader', () => ({ default: () => null }));
vi.mock('../services/api', () => ({
  withToken: (u: string | null) => u ?? '',
  getProducts: vi.fn(),
  getCounts: vi.fn(),
}));

import ListPage from './ListPage';
import * as api from '../services/api';

const summary = (over: Partial<ProductSummary> = {}): ProductSummary => ({
  asin: 'B0FQBYHJ17',
  titulo: 'Cable',
  estado: 'pendiente',
  estrellas: null,
  has_feedback: false,
  photo_count: 0,
  has_video: false,
  thumbnail_url: null,
  updated_at: '',
  ...over,
});

function Where() {
  const l = useLocation();
  return <p data-testid="where">{`${l.pathname}${l.search}`}</p>;
}

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Where />
      <Routes>
        <Route path="/" element={<ListPage />} />
        <Route path="/p/:asin" element={<p>detalle</p>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.mocked(api.getProducts).mockResolvedValue([summary()]);
  vi.mocked(api.getCounts).mockResolvedValue({
    pendiente: 1, listo: 0, en_espera: 3, resena_generada: 0, publicado: 0, pendientes: 1, total: 4,
  });
});

describe('list tabs live in the URL', () => {
  it('reads the active tab from ?filtro= and queries the backend with it', async () => {
    renderAt('/?filtro=en_espera');
    await waitFor(() => expect(api.getProducts).toHaveBeenCalledWith('?filter=en_espera'));
    expect(screen.getByRole('tab', { name: /En espera/ })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('tab', { name: 'En espera (3)' })).toBeInTheDocument();
  });

  it('an unknown value falls back to Todos', async () => {
    renderAt('/?filtro=basura');
    await waitFor(() => expect(api.getProducts).toHaveBeenCalledWith(''));
    expect(screen.getByRole('tab', { name: 'Todos' })).toHaveAttribute('aria-selected', 'true');
  });

  it('clicking a tab updates the URL, keeping the search; Todos clears it', async () => {
    renderAt('/?q=cable');
    await userEvent.click(screen.getByRole('tab', { name: 'Listos' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/?q=cable&filtro=listos');
    await userEvent.click(screen.getByRole('tab', { name: 'Todos' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/?q=cable');
  });
});

describe('ASIN link in the list', () => {
  it('opens amazon.es in a new tab and does not navigate to the detail', async () => {
    renderAt('/?filtro=listos');
    const link = await screen.findByRole('link', { name: 'B0FQBYHJ17' });
    expect(link).toHaveAttribute('href', 'https://www.amazon.es/dp/B0FQBYHJ17');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    // jsdom does not follow links; the point is that the click must not bubble to the card.
    link.addEventListener('click', (e) => e.preventDefault());
    await userEvent.click(link);
    expect(screen.queryByText('detalle')).toBeNull();
    expect(screen.getByTestId('where')).toHaveTextContent('/?filtro=listos');
  });

  it('clicking the card still opens the detail', async () => {
    renderAt('/?filtro=listos');
    await userEvent.click(await screen.findByRole('link', { name: 'Cable' }));
    expect(await screen.findByText('detalle')).toBeInTheDocument();
  });
});
