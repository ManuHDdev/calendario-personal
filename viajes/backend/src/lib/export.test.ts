import { describe, it, expect } from 'vitest';
import { buildGpx } from './gpx';
import { buildIcs, escapeIcsText, foldLine } from './ics';
import { summarizeTrip } from './summary';
import { haversineMeters } from './geo';
import { makePlace } from './place.fixture';

const trip = { name: 'Extremadura <2026> & más', description: 'Road trip' };

const museum = makePlace({
  name: 'Museo "Romano"',
  lat: 38.9166,
  lng: -6.3436,
  visitDate: '2026-07-01',
  startTime: '10:30',
  durationMin: 90,
  notes: 'Comprar entradas, llegar pronto; ver mosaicos',
  url: 'https://example.com/museo?a=1&b=2',
  cost: 12.5,
  address: 'C/ Santa Eulalia, Mérida',
});
const castle = makePlace({ name: 'Alcazaba', lat: 38.9138, lng: -6.3498, visitDate: '2026-07-01', dayOrder: 1, cost: 6 });
const pending = makePlace({ name: 'Pendiente', type: 'comida', lat: 38.9, lng: -6.3 });
const hotel = makePlace({
  name: 'Hotel Centro',
  type: 'alojamiento',
  lat: 38.91,
  lng: -6.34,
  checkIn: '2026-07-01',
  checkOut: '2026-07-03',
  cost: 180,
});

describe('buildGpx', () => {
  const gpx = buildGpx(trip, [museum, castle, pending, hotel]);

  it('produces a GPX 1.1 document with one waypoint per place', () => {
    expect(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(gpx).toContain('<gpx version="1.1"');
    expect((gpx.match(/<wpt /g) ?? []).length).toBe(4);
    expect(gpx).toContain('<wpt lat="38.9166" lon="-6.3436">');
    expect(gpx).toContain('<type>alojamiento</type>');
  });

  it('escapes XML special characters everywhere', () => {
    expect(gpx).toContain('Extremadura &lt;2026&gt; &amp; más');
    expect(gpx).toContain('Museo &quot;Romano&quot;');
    expect(gpx).toContain('https://example.com/museo?a=1&amp;b=2');
    expect(gpx).not.toContain('<2026>');
  });

  it('adds one route per scheduled day with stops in visit order, excluding lodging and unscheduled', () => {
    expect((gpx.match(/<rte>/g) ?? []).length).toBe(1);
    const rte = gpx.slice(gpx.indexOf('<rte>'), gpx.indexOf('</rte>'));
    expect(rte.indexOf('Museo')).toBeLessThan(rte.indexOf('Alcazaba'));
    expect(rte).not.toContain('Hotel');
    expect(rte).not.toContain('Pendiente');
  });

  it('emits no routes when nothing is scheduled', () => {
    expect(buildGpx(trip, [pending])).not.toContain('<rte>');
  });
});

describe('ICS helpers', () => {
  it('escapes backslash, semicolon, comma and newlines', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });

  it('folds long lines at 75 octets without splitting multibyte characters', () => {
    const long = 'SUMMARY:' + 'ñ'.repeat(100);
    const folded = foldLine(long);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true);
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(long);
  });

  it('leaves short lines untouched', () => {
    expect(foldLine('SUMMARY:hi')).toBe('SUMMARY:hi');
  });
});

describe('buildIcs', () => {
  const now = new Date('2026-06-01T12:00:00Z');
  const ics = buildIcs(trip, [museum, castle, pending, hotel], now);
  const unfolded = ics.replace(/\r\n /g, '');

  it('is a CRLF-terminated VCALENDAR with the trip name', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(unfolded).toContain('X-WR-CALNAME:Extremadura <2026> & más');
  });

  it('only exports places that can be placed on a calendar (dated, or lodging with dates)', () => {
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(3);
    expect(unfolded).not.toContain('Pendiente');
  });

  it('writes a timed place with floating start and duration-based end', () => {
    expect(unfolded).toContain('DTSTART:20260701T103000');
    expect(unfolded).toContain('DTEND:20260701T120000');
    expect(unfolded).toContain('SUMMARY:Museo "Romano"');
    expect(unfolded).toContain('GEO:38.9166;-6.3436');
    expect(unfolded).toContain('DESCRIPTION:Comprar entradas\\, llegar pronto\\; ver mosaicos');
  });

  it('writes an untimed place as an all-day event ending the next day', () => {
    const block = unfolded.split('BEGIN:VEVENT').find((b) => b.includes('SUMMARY:Alcazaba'))!;
    expect(block).toContain('DTSTART;VALUE=DATE:20260701');
    expect(block).toContain('DTEND;VALUE=DATE:20260702');
  });

  it('writes lodging as a multi-day all-day event (exclusive end = check-out)', () => {
    const block = unfolded.split('BEGIN:VEVENT').find((b) => b.includes('Alojamiento: Hotel Centro'))!;
    expect(block).toContain('DTSTART;VALUE=DATE:20260701');
    expect(block).toContain('DTEND;VALUE=DATE:20260703');
  });

  it('rolls a timed event over midnight and month boundaries correctly', () => {
    const night = makePlace({ name: 'Night tour', visitDate: '2026-07-31', startTime: '23:30', durationMin: 120 });
    const out = buildIcs(trip, [night], now);
    expect(out).toContain('DTSTART:20260731T233000');
    expect(out).toContain('DTEND:20260801T013000');
  });

  it('uses a stable UID per place and a UTC DTSTAMP', () => {
    expect(unfolded).toContain(`UID:${museum.id}@viajes.elbunkerdelingeniero`);
    expect(unfolded).toContain('DTSTAMP:20260601T120000Z');
  });

  it('defaults to a one hour duration when none is set', () => {
    const p = makePlace({ visitDate: '2026-07-01', startTime: '09:00' });
    expect(buildIcs(trip, [p], now)).toContain('DTEND:20260701T100000');
  });
});

describe('summarizeTrip', () => {
  it('counts types, visited, scheduled/unscheduled, days and cost', () => {
    const done = makePlace({ visitDate: '2026-07-02', visited: true, cost: 10 });
    const s = summarizeTrip([museum, castle, pending, hotel, done]);
    expect(s.totalPlaces).toBe(5);
    expect(s.countsByType).toEqual({ alojamiento: 1, interes: 3, comida: 1, otro: 0 });
    expect(s.visited).toBe(1);
    expect(s.scheduled).toBe(3);
    expect(s.unscheduled).toBe(1);
    expect(s.days).toBe(2);
    expect(s.totalCost).toBe(208.5);
  });

  it('sums straight-line km per day in visit order, ignoring lodging and pending places', () => {
    const s = summarizeTrip([museum, castle, pending, hotel]);
    const expectedKm = haversineMeters(museum, castle) / 1000;
    expect(s.straightLineKm).toBeCloseTo(expectedKm, 1);
  });

  it('handles an empty trip', () => {
    const s = summarizeTrip([]);
    expect(s).toMatchObject({ totalPlaces: 0, days: 0, totalCost: 0, straightLineKm: 0 });
  });
});
