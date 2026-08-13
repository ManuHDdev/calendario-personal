import type {
  GroupSummary,
  GroupDetail,
  Member,
  Expense,
  ExpenseCreateInput,
  ExpenseUpdateInput,
  Balance,
  Transfer,
  ByTokenResponse,
} from '../types';

const BASE = '/reparto/api';

// Todas las funciones (salvo `resolveGroupByToken`, público por diseño)
// reciben el bearer token como primer parámetro explícito en vez de leerlo de
// un singleton de Keycloak — la vista de grupo es compartida entre el flujo
// de gestor (JWT de Keycloak) y el flujo de miembro sin cuenta (token de
// sesión de grupo), y ambos "solo significan mandar esta cabecera
// Authorization" a las mismas llamadas (tasks.md 7.4).
function headers(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function handleError(res: Response): Promise<never> {
  let msg = `Error ${res.status}`;
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    if (body.message) msg = body.message;
    else if (body.error) msg = body.error;
  } catch { /* ignore */ }
  throw new ApiError(res.status, msg);
}

// ── Grupos (gestor Keycloak) ─────────────────────────────────────────────

export async function listGroups(token: string): Promise<GroupSummary[]> {
  const res = await fetch(`${BASE}/groups`, { headers: headers(token) });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<GroupSummary[]>;
}

export async function createGroup(token: string, name: string): Promise<GroupDetail> {
  const res = await fetch(`${BASE}/groups`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<GroupDetail>;
}

export async function deleteGroup(token: string, groupId: string): Promise<void> {
  const res = await fetch(`${BASE}/groups/${groupId}`, { method: 'DELETE', headers: headers(token) });
  if (!res.ok && res.status !== 204) await handleError(res);
}

export async function rotateGroupToken(token: string, groupId: string): Promise<{ accessToken: string }> {
  const res = await fetch(`${BASE}/groups/${groupId}/rotate-token`, { method: 'POST', headers: headers(token) });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<{ accessToken: string }>;
}

// ── Enlace de acceso sin cuenta ──────────────────────────────────────────

/** Público, sin cabecera Authorization. `null` si el token no resuelve a ningún grupo activo (404). */
export async function resolveGroupByToken(accessToken: string): Promise<ByTokenResponse | null> {
  const res = await fetch(`${BASE}/groups/by-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: accessToken }),
  });
  if (res.status === 404) return null;
  if (!res.ok) await handleError(res);
  return res.json() as Promise<ByTokenResponse>;
}

// ── Grupo (gestor o token de sesión de grupo) ────────────────────────────

export async function getGroup(token: string, groupId: string): Promise<GroupDetail> {
  const res = await fetch(`${BASE}/groups/${groupId}`, { headers: headers(token) });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<GroupDetail>;
}

/** El backend devuelve el mismo DTO que POST /groups (sin `members`), no un GroupDetail completo. */
export async function renameGroup(
  token: string,
  groupId: string,
  name: string,
): Promise<GroupSummary & { accessToken?: string }> {
  const res = await fetch(`${BASE}/groups/${groupId}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<GroupSummary & { accessToken?: string }>;
}

export async function listMembers(token: string, groupId: string): Promise<Member[]> {
  const res = await fetch(`${BASE}/groups/${groupId}/members`, { headers: headers(token) });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Member[]>;
}

export async function createMember(token: string, groupId: string, name: string): Promise<Member> {
  const res = await fetch(`${BASE}/groups/${groupId}/members`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Member>;
}

export async function updateMember(token: string, groupId: string, memberId: string, name: string): Promise<Member> {
  const res = await fetch(`${BASE}/groups/${groupId}/members/${memberId}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Member>;
}

/** Solo gestor Keycloak — el backend rechaza esto vía token de sesión de grupo con 401/403. */
export async function deleteMember(token: string, groupId: string, memberId: string): Promise<void> {
  const res = await fetch(`${BASE}/groups/${groupId}/members/${memberId}`, {
    method: 'DELETE',
    headers: headers(token),
  });
  if (!res.ok && res.status !== 204) await handleError(res);
}

// ── Gastos ────────────────────────────────────────────────────────────────

export async function listExpenses(token: string, groupId: string): Promise<Expense[]> {
  const res = await fetch(`${BASE}/groups/${groupId}/expenses`, { headers: headers(token) });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Expense[]>;
}

export async function createExpense(token: string, groupId: string, data: ExpenseCreateInput): Promise<Expense> {
  const res = await fetch(`${BASE}/groups/${groupId}/expenses`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Expense>;
}

export async function updateExpense(
  token: string,
  groupId: string,
  expenseId: string,
  data: ExpenseUpdateInput,
): Promise<Expense> {
  const res = await fetch(`${BASE}/groups/${groupId}/expenses/${expenseId}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Expense>;
}

export async function deleteExpense(token: string, groupId: string, expenseId: string): Promise<void> {
  const res = await fetch(`${BASE}/groups/${groupId}/expenses/${expenseId}`, {
    method: 'DELETE',
    headers: headers(token),
  });
  if (!res.ok && res.status !== 204) await handleError(res);
}

export async function listCategories(token: string, groupId: string): Promise<string[]> {
  const res = await fetch(`${BASE}/groups/${groupId}/categories`, { headers: headers(token) });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<string[]>;
}

// ── Balances y liquidación ────────────────────────────────────────────────

export async function getBalances(token: string, groupId: string): Promise<Balance[]> {
  const res = await fetch(`${BASE}/groups/${groupId}/balances`, { headers: headers(token) });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Balance[]>;
}

export async function getSettlement(token: string, groupId: string): Promise<Transfer[]> {
  const res = await fetch(`${BASE}/groups/${groupId}/settlement`, { headers: headers(token) });
  if (!res.ok) await handleError(res);
  return res.json() as Promise<Transfer[]>;
}
