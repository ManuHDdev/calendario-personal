import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '../types';

vi.mock('../services/keycloak', () => ({ default: { token: 'tok', tokenParsed: {}, updateToken: vi.fn() } }));
vi.mock('../services/api', () => ({
  withToken: (u: string | null) => u ?? '',
  saveContent: vi.fn().mockResolvedValue({}),
  markListo: vi.fn().mockResolvedValue({}),
  markPublicado: vi.fn().mockResolvedValue({}),
  uploadMedia: vi.fn(),
  deleteMedia: vi.fn(),
  getProduct: vi.fn(),
  getProducts: vi.fn(),
  getCounts: vi.fn(),
}));

import StarSelector from './StarSelector';
import CopyField from './CopyField';
import { DetailBody } from '../pages/DetailPage';
import * as api from '../services/api';

const product = (over: Partial<Product> = {}): Product => ({
  asin: 'B0TEST',
  titulo: 'Cable',
  descripcion: 'desc',
  feedback: 'ok',
  estrellas: 4,
  estado: 'pendiente',
  resena_producto: 'RP',
  resena_resumida: 'RR',
  resena_extendida: 'RE',
  created_at: '',
  updated_at: '',
  media: [{ id: 1, filename: 'a.jpg', type: 'photo', size: 1, created_at: '', url: '/x/a.jpg' }],
  ...over,
});

describe('StarSelector', () => {
  it('selects, and tapping the same star clears', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<StarSelector value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: '3 estrellas' }));
    expect(onChange).toHaveBeenLastCalledWith(3);
    rerender(<StarSelector value={3} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: '3 estrellas' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('radio', { name: '3 estrellas' })).toBeChecked();
  });
  it('is inert when disabled', async () => {
    const onChange = vi.fn();
    render(<StarSelector value={2} onChange={onChange} disabled />);
    await userEvent.click(screen.getByRole('radio', { name: '5 estrellas' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('CopyField', () => {
  afterEach(() => vi.restoreAllMocks());
  it('copies via the clipboard API', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<CopyField label="Reseña resumida" text="hola" />);
    await userEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(writeText).toHaveBeenCalledWith('hola');
    expect(await screen.findByRole('button', { name: 'Copiado' })).toBeInTheDocument();
  });
  it('falls back to execCommand when the clipboard API is missing', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const exec = vi.fn().mockReturnValue(true);
    (document as unknown as { execCommand: typeof exec }).execCommand = exec;
    render(<CopyField label="x" text="hola" />);
    await userEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(exec).toHaveBeenCalledWith('copy');
    expect(await screen.findByRole('button', { name: 'Copiado' })).toBeInTheDocument();
  });
});

describe('DetailBody role gating and states', () => {
  beforeEach(() => vi.clearAllMocks());
  const renderBody = (p: Product, canWrite: boolean) =>
    render(
      <MemoryRouter>
        <DetailBody product={p} canWrite={canWrite} reload={vi.fn().mockResolvedValue(undefined)} />
      </MemoryRouter>,
    );

  it('writer sees upload, delete, estado button and an editable feedback', () => {
    const { container } = renderBody(product(), true);
    expect(container.querySelector('input[type=file]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar archivo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marcar como listo' })).toBeInTheDocument();
    expect(screen.getByLabelText('Feedback')).not.toHaveAttribute('readonly');
  });

  it('read-only (vine_invitado) hides every write control', () => {
    const { container } = renderBody(product(), false);
    expect(container.querySelector('input[type=file]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Eliminar archivo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Marcar como listo' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Añadir/ })).toBeNull();
    expect(screen.getByLabelText('Feedback')).toHaveAttribute('readonly');
    expect(screen.getByRole('radio', { name: '1 estrella' })).toBeDisabled();
  });

  it('shows the generated review and publish button for resena_generada', async () => {
    renderBody(product({ estado: 'resena_generada' }), true);
    expect(screen.getAllByRole('button', { name: 'Copiar' })).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'Marcar como publicado' }));
    await waitFor(() => expect(api.markPublicado).toHaveBeenCalledWith('B0TEST'));
  });

  it('publicado is read-only even for writers', () => {
    renderBody(product({ estado: 'publicado' }), true);
    expect(screen.queryByRole('button', { name: 'Marcar como publicado' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Eliminar archivo' })).toBeNull();
    expect(screen.getByLabelText('Feedback')).toHaveAttribute('readonly');
    expect(screen.getAllByRole('button', { name: 'Copiar' })).toHaveLength(3);
  });

  it('surfaces the backend 409 message when marking listo fails', async () => {
    vi.mocked(api.markListo).mockRejectedValueOnce(new Error('Falta feedback o estrellas'));
    renderBody(product(), true);
    await userEvent.click(screen.getByRole('button', { name: 'Marcar como listo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Falta feedback o estrellas');
  });
});
