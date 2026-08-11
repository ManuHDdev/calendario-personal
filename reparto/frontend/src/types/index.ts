export type SplitType = 'equal' | 'exact' | 'percentage';

export interface GroupSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  id: string;
  groupId: string;
  name: string;
  createdAt: string;
}

export interface GroupDetail extends GroupSummary {
  members: Member[];
  /** Solo presente cuando la petición viene autenticada como gestor Keycloak. */
  accessToken?: string;
}

export interface ExpenseSplit {
  memberId: string;
  shareAmount: number;
  sharePercentage: number | null;
}

export interface Expense {
  id: string;
  groupId: string;
  payerMemberId: string;
  amount: number;
  description: string;
  date: string;
  category: string | null;
  splitType: SplitType;
  createdAt: string;
  updatedAt: string;
  splits: ExpenseSplit[];
}

export interface EqualParticipantInput {
  memberId: string;
}

export interface ExactParticipantInput {
  memberId: string;
  shareAmount: number;
}

export interface PercentageParticipantInput {
  memberId: string;
  sharePercentage: number;
}

interface BaseExpenseInput {
  payerMemberId: string;
  amount: number;
  description: string;
  date: string;
  category?: string;
}

export type ExpenseCreateInput =
  | (BaseExpenseInput & { splitType: 'equal'; participants: EqualParticipantInput[] })
  | (BaseExpenseInput & { splitType: 'exact'; participants: ExactParticipantInput[] })
  | (BaseExpenseInput & { splitType: 'percentage'; participants: PercentageParticipantInput[] });

/** Actualización parcial de campos simples, sin tocar el reparto existente. */
export interface ExpensePartialUpdateInput {
  payerMemberId?: string;
  amount?: number;
  description?: string;
  date?: string;
  category?: string | null;
}

export type ExpenseUpdateInput = ExpenseCreateInput | ExpensePartialUpdateInput;

export interface Balance {
  memberId: string;
  name: string;
  balance: number;
}

export interface Transfer {
  fromMemberId: string;
  fromMemberName: string | null;
  toMemberId: string;
  toMemberName: string | null;
  amount: number;
}

export interface ByTokenResponse {
  groupId: string;
  groupName: string;
  sessionToken: string;
}

/**
 * Contexto de autorización pasado a la vista de grupo, sea cual sea el
 * mecanismo real (JWT de Keycloak o token de sesión de grupo) — ambos solo
 * significan "manda esta cabecera Authorization" a las mismas llamadas API
 * (ver tasks.md 7.4).
 */
export interface GroupAuth {
  /** Bearer token a enviar en `Authorization`. */
  token: string;
  /** Gestor Keycloak (`admin`/`reparto_admin`): puede borrar grupo, expulsar miembros, rotar enlace. */
  isManager: boolean;
  /** `reparto_invitado` vía Keycloak: solo lectura, sin altas/ediciones. */
  isReadOnly: boolean;
}
