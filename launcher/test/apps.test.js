import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const registry = JSON.parse(
  readFileSync(resolve(__dirname, '../public/apps.json'), 'utf8'),
);
const apps = registry.apps;

// Shape elements only: the icon is injected with innerHTML inside the
// launcher's shadow root, so anything else (script, foreignObject, <a>, event
// handlers, external references) is rejected here.
const ALLOWED_ICON_TAGS = new Set(['path', 'rect', 'circle', 'line', 'polyline', 'polygon', 'ellipse', 'g']);
const ALLOWED_ICON_ATTRS = new Set([
  'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'points',
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'transform',
]);

describe('apps.json registry', () => {
  it('has a version and a non-empty app list', () => {
    expect(registry.version).toBe(1);
    expect(Array.isArray(apps)).toBe(true);
    expect(apps.length).toBeGreaterThan(0);
  });

  it('has unique ids and unique paths', () => {
    const ids = apps.map((a) => a.id);
    const paths = apps.map((a) => a.path);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it.each(apps.map((a) => [a.id, a]))('%s has a valid entry', (_id, app) => {
    expect(Object.keys(app).sort()).toEqual(['color', 'devUrl', 'icon', 'id', 'name', 'path', 'roles']);
    expect(app.id).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(typeof app.name).toBe('string');
    expect(app.name.trim()).not.toBe('');
    expect(app.path).toMatch(/^\/([a-z0-9-]+\/)?$/);
    expect(app.devUrl).toMatch(/^http:\/\/localhost:\d{4}\//);
    expect(app.devUrl.endsWith(app.path)).toBe(true);
    expect(app.color).toMatch(/^#[0-9a-f]{6}$/i);
    if (app.roles !== null) {
      expect(Array.isArray(app.roles)).toBe(true);
      expect(app.roles.length).toBeGreaterThan(0);
      app.roles.forEach((r) => expect(r).toMatch(/^[a-z_]+$/));
    }
    expect(typeof app.icon).toBe('string');
    expect(app.icon.trim()).not.toBe('');
  });

  it.each(apps.map((a) => [a.id, a.icon]))('%s icon only contains safe SVG shapes', (_id, icon) => {
    const doc = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg">${icon}</svg>`,
      'image/svg+xml',
    );
    expect(doc.querySelector('parsererror')).toBeNull();
    const elements = [...doc.documentElement.querySelectorAll('*')];
    expect(elements.length).toBeGreaterThan(0);
    for (const el of elements) {
      expect(ALLOWED_ICON_TAGS.has(el.localName), `tag <${el.localName}>`).toBe(true);
      for (const attr of el.attributes) {
        expect(ALLOWED_ICON_ATTRS.has(attr.name), `attribute ${attr.name}`).toBe(true);
      }
    }
  });

  it('only "/" (Calendario) is the root app', () => {
    expect(apps.filter((a) => a.path === '/').map((a) => a.id)).toEqual(['calendario']);
  });

  it('keeps Panel admin-only (regression: it used to ship with roles: null)', () => {
    expect(apps.find((a) => a.id === 'panel').roles).toEqual(['admin']);
  });
});
