const KC_BASE =
  process.env.KEYCLOAK_BASE_URL ||
  'http://calendario-keycloak:8080/keycloak';
const KC_ADMIN = process.env.KEYCLOAK_ADMIN || 'admin';
const KC_ADMIN_PWD = process.env.KEYCLOAK_ADMIN_PASSWORD || '';
const REALM = 'calendario';
const ADMIN_API = `${KC_BASE}/admin/realms/${REALM}`;

// ── Admin token cache ─────────────────────────────────────────────────────────

interface TokenCache {
  access_token: string;
  expires_at: number;
}

let tokenCache: TokenCache | null = null;

async function getAdminToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expires_at - 30_000) {
    return tokenCache.access_token;
  }
  const res = await fetch(
    `${KC_BASE}/realms/master/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: KC_ADMIN,
        password: KC_ADMIN_PWD,
      }),
    },
  );
  if (!res.ok) throw new Error(`Failed to get admin token: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  return tokenCache.access_token;
}

async function adminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAdminToken();
  return fetch(`${ADMIN_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    },
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AppUser {
  id: string;
  username: string;
}

interface KcUser {
  id: string;
  username: string;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Lista básica de usuarios de la app (id de Keycloak + username), para el selector de permisos. */
export async function listUsers(): Promise<AppUser[]> {
  const res = await adminFetch('/users?max=200');
  if (!res.ok) throw new Error(`Failed to list users: ${res.status}`);
  const users = (await res.json()) as KcUser[];
  return users.map((u) => ({ id: u.id, username: u.username }));
}
