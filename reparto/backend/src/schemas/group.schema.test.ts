import { describe, it, expect } from 'vitest';
import {
  createGroupSchema,
  byTokenSchema,
  createMemberSchema,
  updateMemberSchema,
  updateGroupSchema,
} from './group.schema';

describe('createGroupSchema', () => {
  it('accepts a well-formed group', () => {
    expect(createGroupSchema.safeParse({ name: 'Viaje a Lisboa' }).success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(createGroupSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects a missing name', () => {
    expect(createGroupSchema.safeParse({}).success).toBe(false);
  });
});

describe('byTokenSchema', () => {
  it('accepts a non-empty token', () => {
    expect(byTokenSchema.safeParse({ token: 'abc123' }).success).toBe(true);
  });

  it('rejects an empty token', () => {
    expect(byTokenSchema.safeParse({ token: '' }).success).toBe(false);
  });
});

describe('createMemberSchema', () => {
  it('accepts a free-text name with no keycloak account fields', () => {
    const result = createMemberSchema.safeParse({ name: 'Ana' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(createMemberSchema.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('updateMemberSchema', () => {
  it('accepts a rename', () => {
    expect(updateMemberSchema.safeParse({ name: 'Ana María' }).success).toBe(true);
  });

  it('rejects unknown fields (strict)', () => {
    expect(updateMemberSchema.safeParse({ name: 'Ana', keycloakUserId: 'x' }).success).toBe(false);
  });
});

describe('updateGroupSchema', () => {
  it('accepts a rename', () => {
    expect(updateGroupSchema.safeParse({ name: 'Viaje a Oporto' }).success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(updateGroupSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects unknown fields (strict)', () => {
    expect(updateGroupSchema.safeParse({ name: 'Viaje', accessToken: 'x' }).success).toBe(false);
  });
});
