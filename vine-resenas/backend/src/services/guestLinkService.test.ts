import { describe, expect, it } from 'vitest';
import { HttpError } from '../errors';
import { FakeRepo } from '../testing/fakes';
import { redactUrl } from '../logRedaction';
import { createGuestLink, generateToken, hashToken, linkStatus, resolveGuestLink } from './guestLinkService';
import { RateLimiter } from './rateLimiter';

const ASIN = 'B0FQBYHJ17';
const DAY = 24 * 60 * 60 * 1000;

describe('token generation and hashing', () => {
  it('generates 32 random bytes as 43 base64url chars, never repeating', () => {
    const a = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a, 'base64url')).toHaveLength(32);
    expect(generateToken()).not.toBe(a);
  });
  it('hashes with SHA-256 hex, deterministically, and the hash does not contain the token', () => {
    const t = generateToken();
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t);
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('linkStatus', () => {
  const now = new Date('2026-01-10T00:00:00Z');
  it('is revoked, expired or active', () => {
    expect(linkStatus({ expires_at: '2026-02-01T00:00:00Z', revoked_at: null }, now)).toBe('active');
    expect(linkStatus({ expires_at: '2026-01-01T00:00:00Z', revoked_at: null }, now)).toBe('expired');
    expect(linkStatus({ expires_at: '2026-02-01T00:00:00Z', revoked_at: '2026-01-02T00:00:00Z' }, now)).toBe('revoked');
  });
});

describe('createGuestLink / resolveGuestLink', () => {
  function setup() {
    const repo = new FakeRepo();
    repo.seed({ asin: ASIN, titulo: 'T' });
    return repo;
  }

  it('stores only the hash and resolves the raw token', async () => {
    const repo = setup();
    const { link, token } = await createGuestLink(repo, ASIN, { expiresInDays: 14, createdBy: 'manu' });
    expect(repo.links[0].token_hash).toBe(hashToken(token));
    expect(JSON.stringify(repo.links)).not.toContain(token);
    expect(new Date(link.expires_at).getTime() - Date.now()).toBeGreaterThan(13.9 * DAY);
    const r = await resolveGuestLink(repo, token);
    expect(r.link.id).toBe(link.id);
    expect(r.product.asin).toBe(ASIN);
  });

  it('gives the same 404 for unknown, malformed, expired and revoked tokens', async () => {
    const repo = setup();
    const ok = await createGuestLink(repo, ASIN, { expiresInDays: 1, createdBy: null });
    const expired = await createGuestLink(repo, ASIN, {
      expiresInDays: 1,
      createdBy: null,
      now: new Date(Date.now() - 5 * DAY),
    });
    const revoked = await createGuestLink(repo, ASIN, { expiresInDays: 5, createdBy: null });
    await repo.revokeGuestLink(revoked.link.id);
    const errors: HttpError[] = [];
    for (const t of [generateToken(), 'short', expired.token, revoked.token, 42 as unknown as string]) {
      await resolveGuestLink(repo, t).catch((e) => errors.push(e));
    }
    expect(errors).toHaveLength(5);
    for (const e of errors) expect([e.statusCode, e.code, e.message]).toEqual([404, 'NotFound', 'Link not found']);
    await expect(resolveGuestLink(repo, ok.token)).resolves.toBeTruthy();
  });

  it('refuses published products (410 on resolve, 409 on create)', async () => {
    const repo = setup();
    const { token } = await createGuestLink(repo, ASIN, { expiresInDays: 5, createdBy: null });
    repo.products.get(ASIN)!.estado = 'publicado';
    await expect(resolveGuestLink(repo, token)).rejects.toMatchObject({ statusCode: 410, code: 'LinkClosed' });
    await expect(createGuestLink(repo, ASIN, { expiresInDays: 5, createdBy: null })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('404s for a missing product on create', async () => {
    await expect(createGuestLink(new FakeRepo(), ASIN, { expiresInDays: 5, createdBy: null })).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('RateLimiter', () => {
  it('allows up to max per window, then blocks, then resets', () => {
    let t = 0;
    const rl = new RateLimiter(2, 1000, () => t);
    expect(rl.hit('a').allowed).toBe(true);
    expect(rl.hit('a').allowed).toBe(true);
    const third = rl.hit('a');
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSec).toBe(1);
    expect(rl.hit('b').allowed).toBe(true);
    expect(rl.blocked('a').blocked).toBe(true);
    t = 1001;
    expect(rl.blocked('a').blocked).toBe(false);
    expect(rl.hit('a').allowed).toBe(true);
  });
  it('stays bounded under a flood of distinct keys', () => {
    const rl = new RateLimiter(1, 60_000, () => 0, 50);
    for (let i = 0; i < 500; i++) rl.hit(`ip${i}`);
    expect((rl as unknown as { hits: Map<string, unknown> }).hits.size).toBeLessThanOrEqual(50);
  });
});

describe('redactUrl', () => {
  it('hides the guest token everywhere in the path and drops the query', () => {
    const t = generateToken();
    expect(redactUrl(`/vine-resenas/api/guest/${t}`)).toBe('/vine-resenas/api/guest/[redacted]');
    expect(redactUrl(`/vine-resenas/api/guest/${t}/media/1-a.jpg?x=1`)).toBe(
      '/vine-resenas/api/guest/[redacted]/media/1-a.jpg',
    );
    expect(redactUrl('/vine-resenas/api/ui/media/A/b.jpg?token=jwt')).toBe('/vine-resenas/api/ui/media/A/b.jpg');
  });
});
