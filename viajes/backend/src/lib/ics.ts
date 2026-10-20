import type { Place, Trip } from './types';

const DEFAULT_DURATION_MIN = 60;

/** RFC 5545 TEXT escaping. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Folds a content line at 75 octets (UTF-8 aware), continuation lines start with a space. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = '';
  let currentBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (currentBytes + size > limit) {
      out.push(current);
      current = '';
      currentBytes = 0;
      limit = 74; // continuation lines carry a leading space
    }
    current += ch;
    currentBytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

const pad = (n: number): string => String(n).padStart(2, '0');

function dateToIcs(date: string): string {
  return date.replace(/-/g, '');
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Floating local date-time (no timezone): the group sees the same wall-clock time anywhere. */
function localDateTime(date: string, time: string, plusMinutes = 0): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, hh, mm + plusMinutes));
  return (
    `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}` +
    `T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00`
  );
}

function stamp(now: Date): string {
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  );
}

function eventLines(place: Place, dtstamp: string): string[] | null {
  const lines: string[] = ['BEGIN:VEVENT', `UID:${place.id}@viajes.elbunkerdelingeniero`, `DTSTAMP:${dtstamp}`];

  if (place.type === 'alojamiento') {
    const start = place.checkIn ?? place.checkOut;
    if (!start) return null;
    // DTEND is exclusive for all-day events: the check-out day itself is not a night of the stay.
    const end = place.checkIn && place.checkOut && place.checkOut > place.checkIn ? place.checkOut : addDays(start, 1);
    lines.push(`DTSTART;VALUE=DATE:${dateToIcs(start)}`, `DTEND;VALUE=DATE:${dateToIcs(end)}`);
    lines.push(`SUMMARY:${escapeIcsText(`Alojamiento: ${place.name}`)}`);
  } else {
    if (!place.visitDate) return null;
    if (place.startTime) {
      const minutes = place.durationMin && place.durationMin > 0 ? place.durationMin : DEFAULT_DURATION_MIN;
      lines.push(
        `DTSTART:${localDateTime(place.visitDate, place.startTime)}`,
        `DTEND:${localDateTime(place.visitDate, place.startTime, minutes)}`,
      );
    } else {
      lines.push(
        `DTSTART;VALUE=DATE:${dateToIcs(place.visitDate)}`,
        `DTEND;VALUE=DATE:${dateToIcs(addDays(place.visitDate, 1))}`,
      );
    }
    lines.push(`SUMMARY:${escapeIcsText(place.name)}`);
  }

  lines.push(`LOCATION:${escapeIcsText(place.address ?? `${place.lat}, ${place.lng}`)}`);
  lines.push(`GEO:${place.lat};${place.lng}`);
  const description = [place.notes, place.url].filter(Boolean).join('\n');
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  if (place.url) lines.push(`URL:${place.url}`);
  lines.push(`CATEGORIES:${escapeIcsText(place.type)}`);
  lines.push('END:VEVENT');
  return lines;
}

/** iCalendar export: dated places become events, lodging becomes a multi-day all-day event. */
export function buildIcs(trip: Pick<Trip, 'name'>, places: Place[], now: Date = new Date()): string {
  const dtstamp = stamp(now);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ElBunkerDelIngeniero//Viajes//ES',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcsText(trip.name)}`,
  ];
  for (const place of places) {
    const ev = eventLines(place, dtstamp);
    if (ev) lines.push(...ev);
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
