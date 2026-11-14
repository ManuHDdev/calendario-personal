import { describe, it, expect } from 'vitest';
import { classifyPlace } from './placeKind';

describe('classifyPlace', () => {
  it.each([
    ['tourism', 'attraction', 'interes', 'Atracción'],
    ['tourism', 'museum', 'interes', 'Museo'],
    ['tourism', 'viewpoint', 'interes', 'Mirador'],
    ['tourism', 'gallery', 'interes', 'Galería'],
    ['tourism', 'artwork', 'interes', 'Obra de arte'],
    ['historic', 'castle', 'interes', 'Castillo'],
    ['historic', 'monument', 'interes', 'Monumento'],
    ['historic', 'whatever', 'interes', 'Lugar histórico'],
    ['leisure', 'park', 'interes', 'Parque'],
    ['leisure', 'garden', 'interes', 'Jardín'],
    ['natural', 'peak', 'interes', 'Pico'],
    ['natural', 'unknown', 'interes', 'Paraje natural'],
    ['man_made', 'tower', 'interes', 'Torre'],
    ['man_made', 'lighthouse', 'interes', 'Faro'],
    ['amenity', 'place_of_worship', 'interes', 'Lugar de culto'],
    ['amenity', 'theatre', 'interes', 'Teatro'],
    ['tourism', 'hotel', 'alojamiento', 'Hotel'],
    ['tourism', 'hostel', 'alojamiento', 'Albergue'],
    ['tourism', 'guest_house', 'alojamiento', 'Casa de huéspedes'],
    ['tourism', 'camp_site', 'alojamiento', 'Camping'],
    ['amenity', 'restaurant', 'comida', 'Restaurante'],
    ['amenity', 'cafe', 'comida', 'Café'],
    ['amenity', 'bar', 'comida', 'Bar'],
    ['amenity', 'fast_food', 'comida', 'Comida rápida'],
    ['highway', 'residential', 'otro', 'Calle'],
    ['building', 'yes', 'otro', 'Edificio'],
    ['building', 'palace', 'interes', 'Palacio'],
    ['building', 'cathedral', 'interes', 'Catedral'],
    ['shop', 'bakery', 'otro', 'Bakery'],
    [undefined, undefined, 'otro', 'Lugar'],
  ])('%s/%s -> %s (%s)', (category, type, kind, label) => {
    const r = classifyPlace(category, type);
    expect(r.kind).toBe(kind);
    expect(r.label).toBe(label);
    expect(r.admin).toBe(false);
  });

  it('flags settlements and administrative boundaries, labelled by addresstype', () => {
    expect(classifyPlace('place', 'city')).toEqual({ kind: 'otro', label: 'Ciudad', admin: true });
    expect(classifyPlace('boundary', 'administrative', 'state')).toEqual({ kind: 'otro', label: 'Región', admin: true });
    expect(classifyPlace('boundary', 'administrative').admin).toBe(true);
  });

  it('does not treat house addresses as administrative', () => {
    expect(classifyPlace('place', 'house')).toEqual({ kind: 'otro', label: 'Dirección', admin: false });
  });
});
