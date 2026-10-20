import { groupByDay } from './itinerary';
import type { Place, Trip } from './types';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function describe(place: Place): string {
  const parts: string[] = [];
  if (place.visitDate) parts.push(`Visit: ${place.visitDate}${place.startTime ? ` ${place.startTime}` : ''}`);
  if (place.checkIn || place.checkOut) parts.push(`Stay: ${place.checkIn ?? '?'} -> ${place.checkOut ?? '?'}`);
  if (place.address) parts.push(place.address);
  if (place.notes) parts.push(place.notes);
  if (place.url) parts.push(place.url);
  return parts.join(' | ');
}

/**
 * GPX 1.1 export: every place as a waypoint, plus one route per scheduled day
 * (straight sequence of that day's stops in visit order).
 */
export function buildGpx(trip: Pick<Trip, 'name' | 'description'>, places: Place[]): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="ElBunkerDelIngeniero Viajes" xmlns="http://www.topografix.com/GPX/1/1">',
    '  <metadata>',
    `    <name>${esc(trip.name)}</name>`,
  ];
  if (trip.description) lines.push(`    <desc>${esc(trip.description)}</desc>`);
  lines.push('  </metadata>');

  for (const p of places) {
    lines.push(`  <wpt lat="${p.lat}" lon="${p.lng}">`);
    lines.push(`    <name>${esc(p.name)}</name>`);
    const desc = describe(p);
    if (desc) lines.push(`    <desc>${esc(desc)}</desc>`);
    if (p.url) lines.push(`    <link href="${esc(p.url)}"/>`);
    lines.push(`    <type>${esc(p.type)}</type>`);
    lines.push('  </wpt>');
  }

  const { days } = groupByDay(places);
  for (const date of [...days.keys()].sort()) {
    const stops = days.get(date) ?? [];
    lines.push('  <rte>');
    lines.push(`    <name>${esc(`${trip.name} - ${date}`)}</name>`);
    for (const s of stops) {
      lines.push(`    <rtept lat="${s.lat}" lon="${s.lng}"><name>${esc(s.name)}</name></rtept>`);
    }
    lines.push('  </rte>');
  }

  lines.push('</gpx>');
  return lines.join('\n') + '\n';
}
