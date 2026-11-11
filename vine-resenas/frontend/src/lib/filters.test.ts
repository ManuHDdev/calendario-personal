import { describe, expect, it } from 'vitest';
import { badgesFor, buildListQuery, pendientesLabel } from './filters';
import { canRead, canWrite } from './roles';
import type { ProductSummary } from '../types';

const base: ProductSummary = {
  asin: 'B0TEST',
  titulo: 't',
  estado: 'pendiente',
  estrellas: null,
  has_feedback: false,
  photo_count: 0,
  has_video: false,
  thumbnail_url: null,
  updated_at: '',
};

describe('buildListQuery', () => {
  it('is empty for todos without search', () => {
    expect(buildListQuery({ filter: 'todos', q: '  ' })).toBe('');
  });
  it('adds filter and trimmed search', () => {
    expect(buildListQuery({ filter: 'faltan_fotos', q: ' cable ' })).toBe('?filter=faltan_fotos&q=cable');
  });
  it('archive uses estado=publicado and ignores the chip filter', () => {
    expect(buildListQuery({ filter: 'listos', q: '', archive: true })).toBe('?estado=publicado');
  });
});

describe('pendientesLabel', () => {
  it('pluralises', () => {
    expect(pendientesLabel(1)).toBe('1 pendiente');
    expect(pendientesLabel(0)).toBe('0 pendientes');
    expect(pendientesLabel(7)).toBe('7 pendientes');
  });
});

describe('badgesFor', () => {
  it('flags missing data', () => {
    const b = Object.fromEntries(badgesFor(base).map((x) => [x.key, x]));
    expect(b.photos).toMatchObject({ label: '0 fotos', tone: 'warn' });
    expect(b.video.label).toBe('Sin vídeo');
    expect(b.feedback).toMatchObject({ label: 'Sin feedback', tone: 'warn' });
    expect(b.stars).toMatchObject({ label: 'Sin estrellas', tone: 'warn' });
    expect(b.estado.label).toBe('Pendiente');
  });
  it('shows complete data', () => {
    const b = Object.fromEntries(
      badgesFor({ ...base, photo_count: 1, has_video: true, has_feedback: true, estrellas: 4, estado: 'listo' }).map((x) => [x.key, x]),
    );
    expect(b.photos).toMatchObject({ label: '1 foto', tone: 'ok' });
    expect(b.video).toMatchObject({ label: 'Vídeo', tone: 'ok' });
    expect(b.feedback.tone).toBe('ok');
    expect(b.stars.label).toContain('4');
    expect(b.estado.label).toBe('Listo');
  });
});

describe('roles', () => {
  it('write: admin and vine_admin only', () => {
    expect(canWrite(['admin'])).toBe(true);
    expect(canWrite(['vine_admin'])).toBe(true);
    expect(canWrite(['vine_invitado'])).toBe(false);
    expect(canWrite(['familia'])).toBe(false);
  });
  it('read: adds vine_invitado, excludes familia/invitado', () => {
    expect(canRead(['vine_invitado'])).toBe(true);
    expect(canRead(['familia'])).toBe(false);
    expect(canRead(['invitado'])).toBe(false);
    expect(canRead([])).toBe(false);
  });
});
