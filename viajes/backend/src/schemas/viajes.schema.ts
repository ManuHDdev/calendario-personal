import { z } from 'zod';
import { PLACE_TYPES } from '../lib/types';
import { PROFILES } from '../lib/geo';

/** YYYY-MM-DD that is also a real calendar date (rejects 2026-02-31). */
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((s) => {
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, 'Not a valid calendar date');

const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM');

const httpUrl = z
  .string()
  .max(2000)
  .refine((s) => {
    try {
      const u = new URL(s);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'URL must be http(s)');

const tripFields = {
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  startDate: dateString.nullable().optional(),
  endDate: dateString.nullable().optional(),
};

export const createTripSchema = z
  .object(tripFields)
  .strict()
  .refine((t) => !t.startDate || !t.endDate || t.endDate >= t.startDate, {
    message: 'endDate must not be before startDate',
    path: ['endDate'],
  });

export const updateTripSchema = z
  .object(tripFields)
  .partial()
  .strict()
  .refine((t) => Object.keys(t).length > 0, { message: 'Nothing to update' })
  .refine((t) => !t.startDate || !t.endDate || t.endDate >= t.startDate, {
    message: 'endDate must not be before startDate',
    path: ['endDate'],
  });

const placeFields = {
  type: z.enum(PLACE_TYPES),
  name: z.string().trim().min(1, 'Name is required').max(160),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  url: httpUrl.nullable().optional(),
  cost: z.number().min(0).max(10_000_000).nullable().optional(),
  visitDate: dateString.nullable().optional(),
  startTime: timeString.nullable().optional(),
  durationMin: z.number().int().min(1).max(1440).nullable().optional(),
  checkIn: dateString.nullable().optional(),
  checkOut: dateString.nullable().optional(),
  visited: z.boolean().optional(),
};

type PlaceFieldsInput = {
  visitDate?: string | null;
  startTime?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
};

function crossFieldIssues(p: PlaceFieldsInput, ctx: z.RefinementCtx): void {
  if (p.checkIn && p.checkOut && p.checkOut < p.checkIn) {
    ctx.addIssue({ code: 'custom', message: 'checkOut must not be before checkIn', path: ['checkOut'] });
  }
}

export const createPlaceSchema = z
  .object(placeFields)
  .strict()
  .superRefine((p, ctx) => {
    crossFieldIssues(p, ctx);
    if (p.startTime && !p.visitDate) {
      ctx.addIssue({ code: 'custom', message: 'startTime needs a visitDate', path: ['startTime'] });
    }
  });

export const updatePlaceSchema = z
  .object(placeFields)
  .partial()
  .strict()
  .superRefine((p, ctx) => {
    crossFieldIssues(p, ctx);
    if (Object.keys(p).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Nothing to update' });
    }
  });

export const reorderSchema = z
  .object({
    /** Day the listed places end up in; null = the unscheduled list. */
    date: dateString.nullable(),
    placeIds: z.array(z.string().uuid()).min(1).max(200),
  })
  .strict()
  .refine((r) => new Set(r.placeIds).size === r.placeIds.length, { message: 'Duplicate place ids' });

export const profileSchema = z.enum(PROFILES as unknown as [string, ...string[]]);

export const itineraryQuerySchema = z.object({
  profile: profileSchema.default('driving'),
  withLodging: z.enum(['true', 'false']).default('true'),
  roundTrip: z.enum(['true', 'false']).default('true'),
});

const coord = (min: number, max: number) => z.coerce.number().min(min).max(max);

export const distanceQuerySchema = z.object({
  fromLat: coord(-90, 90),
  fromLng: coord(-180, 180),
  toLat: coord(-90, 90),
  toLng: coord(-180, 180),
  profile: profileSchema.default('driving'),
});

export const tripDistanceQuerySchema = z.object({
  from: z.string().uuid(),
  to: z.string().uuid(),
  profile: profileSchema.default('driving'),
});

export const matrixQuerySchema = z.object({
  ids: z
    .string()
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.string().uuid()).min(2, 'Pick at least two places').max(10, 'At most 10 places')),
  profile: profileSchema.default('driving'),
  road: z.enum(['true', 'false']).default('true'),
});

export const nearestQuerySchema = z.object({
  profile: profileSchema.default('driving'),
  road: z.enum(['true', 'false']).default('false'),
});

export const geocodeSearchSchema = z.object({ q: z.string().trim().min(2).max(200) });

export const geocodeReverseSchema = z.object({ lat: coord(-90, 90), lng: coord(-180, 180) });
