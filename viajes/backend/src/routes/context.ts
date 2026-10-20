import type { FastifyReply } from 'fastify';
import type { ZodTypeAny, z } from 'zod';
import type { RoutingConfig } from '../lib/routing';
import type { Geocoder } from '../lib/geocoding';

export const WRITE_ROLES = ['admin', 'viajes_admin'];
export const READ_ROLES = ['admin', 'familia', 'viajes_admin', 'viajes_invitado'];

/** Everything the routes need from the outside world, injected so tests can fake it. */
export interface AppDeps {
  routing: RoutingConfig;
  geocoder: Geocoder;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Parses with zod; on failure replies 400 and returns undefined. */
export function parseOr400<S extends ZodTypeAny>(schema: S, input: unknown, reply: FastifyReply): z.infer<S> | undefined {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    void reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validation failed', statusCode: 400 });
    return undefined;
  }
  return parsed.data;
}

export function notFound(reply: FastifyReply, what: string): FastifyReply {
  return reply.code(404).send({ error: `${what} not found`, statusCode: 404 });
}

export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'trip';
}
