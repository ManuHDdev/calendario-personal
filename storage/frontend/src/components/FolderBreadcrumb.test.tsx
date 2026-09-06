import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FolderBreadcrumb from './FolderBreadcrumb';

describe('FolderBreadcrumb', () => {
  // Sin globals:true en vitest, RTL no detecta un afterEach global para
  // desmontar solo: sin esto, cada test deja su render anterior en el DOM y
  // "Todos los archivos" (presente en casi todos) acumula coincidencias.
  afterEach(cleanup);

  it('no se muestra en la raíz general: el título ya es inequívoco ahí', () => {
    const { container } = render(
      <FolderBreadcrumb activeFolder={null} rootOnly={false} onNavigate={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('en "Sin carpeta" muestra Todos los archivos > Sin carpeta, con Sin carpeta como actual (no pulsable)', () => {
    render(<FolderBreadcrumb activeFolder={null} rootOnly onNavigate={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Todos los archivos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sin carpeta/ })).toBeNull();
    expect(screen.getByText('Sin carpeta', { selector: '.breadcrumb-current' })).toBeInTheDocument();
  });

  it('muestra cada tramo de una carpeta anidada, con el último marcado como ubicación actual', () => {
    render(<FolderBreadcrumb activeFolder="Viajes/2024/Verano" rootOnly={false} onNavigate={vi.fn()} />);

    // Inicio y tramos intermedios son botones (pulsables).
    expect(screen.getByRole('button', { name: 'Todos los archivos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Viajes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2024' })).toBeInTheDocument();

    // El último tramo es la ubicación actual: se ve, pero no es un botón.
    const actual = screen.getByText('Verano', { selector: '.breadcrumb-current' });
    expect(actual).toHaveAttribute('aria-current', 'location');
    expect(screen.queryByRole('button', { name: 'Verano' })).toBeNull();
  });

  it('pulsar un tramo intermedio navega a esa ruta exacta, no solo un nivel arriba', async () => {
    const onNavigate = vi.fn();
    render(<FolderBreadcrumb activeFolder="Viajes/2024/Verano" rootOnly={false} onNavigate={onNavigate} />);

    await userEvent.click(screen.getByRole('button', { name: '2024' }));

    expect(onNavigate).toHaveBeenCalledOnce();
    expect(onNavigate).toHaveBeenCalledWith('Viajes/2024');
  });

  it('pulsar "Todos los archivos" navega a la raíz (null)', async () => {
    const onNavigate = vi.fn();
    render(<FolderBreadcrumb activeFolder="Viajes" rootOnly={false} onNavigate={onNavigate} />);

    await userEvent.click(screen.getByRole('button', { name: 'Todos los archivos' }));

    expect(onNavigate).toHaveBeenCalledWith(null);
  });

  it('una carpeta de un solo nivel muestra solo el crumb de inicio y el suyo', () => {
    const { container } = render(
      <FolderBreadcrumb activeFolder="Viajes" rootOnly={false} onNavigate={vi.fn()} />,
    );
    const nav = within(container).getByRole('navigation', { name: 'Ubicación actual' });
    const crumbs = nav.querySelectorAll(':scope > .breadcrumb-crumb');
    expect(crumbs).toHaveLength(2);
  });
});
