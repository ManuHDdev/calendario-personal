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

async function adminFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
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

export interface UserOut {
  id: string;
  username: string;
  email: string;
  enabled: boolean;
  roles: string[];
}

export interface CreateUserIn {
  username: string;
  email?: string;
  password: string;
  roles: string[];
  enabled?: boolean;
}

export interface UpdateUserIn {
  email?: string;
  password?: string;
  roles?: string[];
  enabled?: boolean;
}

interface KcUser {
  id: string;
  username: string;
  email?: string;
  enabled: boolean;
}

interface KcRole {
  id: string;
  name: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getUserRoles(userId: string): Promise<string[]> {
  const res = await adminFetch(`/users/${userId}/role-mappings/realm`);
  if (!res.ok) return [];
  const roles = (await res.json()) as KcRole[];
  return roles.map((r) => r.name);
}

async function getRealmRoleObjects(names: string[]): Promise<KcRole[]> {
  const res = await adminFetch('/roles');
  if (!res.ok) throw new Error('Failed to fetch realm roles');
  const all = (await res.json()) as KcRole[];
  return all.filter((r) => names.includes(r.name));
}

async function setUserRoles(userId: string, roleNames: string[]): Promise<void> {
  // Eliminar todos los roles del realm actuales
  const currentRoles = await adminFetch(
    `/users/${userId}/role-mappings/realm`,
  );
  if (currentRoles.ok) {
    const existing = (await currentRoles.json()) as KcRole[];
    const appRoles = existing.filter((r) =>
      ['admin', 'familia', 'invitado', 'paraisos_admin', 'mapacyd_admin', 'mapacyd_invitado', 'reparto_admin', 'reparto_invitado', 'mensajeria_admin', 'mensajeria_invitado'].includes(r.name),
    );
    if (appRoles.length > 0) {
      await adminFetch(`/users/${userId}/role-mappings/realm`, {
        method: 'DELETE',
        body: JSON.stringify(appRoles),
      });
    }
  }
  // Asignar los nuevos
  if (roleNames.length === 0) return;
  const roleObjects = await getRealmRoleObjects(roleNames);
  if (roleObjects.length === 0) return;
  await adminFetch(`/users/${userId}/role-mappings/realm`, {
    method: 'POST',
    body: JSON.stringify(roleObjects),
  });
}

async function resetPassword(userId: string, password: string): Promise<void> {
  const res = await adminFetch(`/users/${userId}/reset-password`, {
    method: 'PUT',
    body: JSON.stringify({ type: 'password', value: password, temporary: false }),
  });
  if (!res.ok) throw new Error(`Failed to reset password: ${res.status}`);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function listUsers(): Promise<UserOut[]> {
  const res = await adminFetch('/users?max=200');
  if (!res.ok) throw new Error(`Failed to list users: ${res.status}`);
  const users = (await res.json()) as KcUser[];
  return Promise.all(
    users.map(async (u) => ({
      id: u.id,
      username: u.username,
      email: u.email ?? '',
      enabled: u.enabled,
      roles: await getUserRoles(u.id),
    })),
  );
}

export async function createUser(data: CreateUserIn): Promise<UserOut> {
  const body = {
    username: data.username,
    email: data.email ?? '',
    enabled: data.enabled ?? true,
    emailVerified: true,
    credentials: [{ type: 'password', value: data.password, temporary: false }],
  };
  const res = await adminFetch('/users', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 409) throw new Error('El nombre de usuario ya existe');
    throw new Error(`Failed to create user: ${res.status} ${text}`);
  }
  // Keycloak devuelve 201 con Location header
  const location = res.headers.get('Location') ?? '';
  const id = location.split('/').pop() ?? '';

  await setUserRoles(id, data.roles);

  return {
    id,
    username: data.username,
    email: data.email ?? '',
    enabled: data.enabled ?? true,
    roles: data.roles,
  };
}

export async function updateUser(
  userId: string,
  data: UpdateUserIn,
): Promise<UserOut> {
  // Actualizar datos básicos
  const updateBody: Record<string, unknown> = {};
  if (data.email !== undefined) updateBody.email = data.email;
  if (data.enabled !== undefined) updateBody.enabled = data.enabled;

  if (Object.keys(updateBody).length > 0) {
    const res = await adminFetch(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(updateBody),
    });
    if (!res.ok) throw new Error(`Failed to update user: ${res.status}`);
  }

  // Cambiar contraseña si se proporcionó
  if (data.password) {
    await resetPassword(userId, data.password);
  }

  // Actualizar roles si se proporcionaron
  if (data.roles !== undefined) {
    await setUserRoles(userId, data.roles);
  }

  // Devolver usuario actualizado
  const res = await adminFetch(`/users/${userId}`);
  if (!res.ok) throw new Error(`Failed to fetch updated user: ${res.status}`);
  const u = (await res.json()) as KcUser;
  const roles = await getUserRoles(userId);

  return {
    id: u.id,
    username: u.username,
    email: u.email ?? '',
    enabled: u.enabled,
    roles,
  };
}

export async function deleteUser(userId: string): Promise<void> {
  const res = await adminFetch(`/users/${userId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete user: ${res.status}`);
}

export async function listRoles(): Promise<string[]> {
  return ['admin', 'familia', 'invitado', 'paraisos_admin', 'mapacyd_admin', 'mapacyd_invitado', 'reparto_admin', 'reparto_invitado', 'mensajeria_admin', 'mensajeria_invitado'];
}

export async function changeOwnPassword(userId: string, password: string): Promise<void> {
  await resetPassword(userId, password);
}
