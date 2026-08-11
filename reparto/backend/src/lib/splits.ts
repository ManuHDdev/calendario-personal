// Cálculo/validación de reparto de gastos — funciones puras (sin BD, sin
// Fastify) para poder testearlas de forma aislada (design.md "Reparto de
// gastos: expense + expense_split, tres modos con CHECK en cada uno" — la
// validación de sumas vive en el backend, no en SQL).

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

export interface ResolvedSplit {
  memberId: string;
  shareAmount: number;
  sharePercentage: number | null;
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

const CENTS_PER_UNIT = 100;
const PERCENTAGE_TOLERANCE = 0.01;

function toCents(amount: number): number {
  return Math.round(amount * CENTS_PER_UNIT);
}

function fromCents(cents: number): number {
  return cents / CENTS_PER_UNIT;
}

/**
 * Reparte `amount` en partes iguales entre `participants`. El resto de
 * redondeo (céntimos) se asigna a los primeros N participantes en el orden
 * recibido — orden estable y determinista, para que la suma cuadre exacto
 * con `amount` (spec.md "Expense split — equal").
 */
export function resolveEqualSplit(
  amount: number,
  participants: EqualParticipantInput[],
): ResolvedSplit[] {
  const n = participants.length;
  if (n === 0) throw new Error('Se requiere al menos un participante');

  const totalCents = toCents(amount);
  const baseCents = Math.floor(totalCents / n);
  const remainder = totalCents - baseCents * n;

  return participants.map((p, i) => ({
    memberId: p.memberId,
    shareAmount: fromCents(baseCents + (i < remainder ? 1 : 0)),
    sharePercentage: null,
  }));
}

/**
 * Valida que la suma de `shareAmount` cuadre exactamente con `amount`
 * (spec.md "Expense split — exact amounts"). Compara en céntimos para
 * evitar errores de coma flotante.
 */
export function validateExactSplit(amount: number, participants: ExactParticipantInput[]): ValidationResult {
  const totalCents = toCents(amount);
  const sumCents = participants.reduce((acc, p) => acc + toCents(p.shareAmount), 0);
  if (sumCents !== totalCents) {
    return {
      valid: false,
      message: `La suma de los importes (${fromCents(sumCents).toFixed(2)}) no coincide con el importe total (${amount.toFixed(2)})`,
    };
  }
  return { valid: true };
}

export function resolveExactSplit(participants: ExactParticipantInput[]): ResolvedSplit[] {
  return participants.map((p) => ({
    memberId: p.memberId,
    shareAmount: fromCents(toCents(p.shareAmount)),
    sharePercentage: null,
  }));
}

/**
 * Valida que la suma de `sharePercentage` sea 100 con un margen de ±0.01
 * (spec.md "Expense split — percentage").
 */
export function validatePercentageSplit(participants: PercentageParticipantInput[]): ValidationResult {
  const sum = participants.reduce((acc, p) => acc + p.sharePercentage, 0);
  if (Math.abs(sum - 100) > PERCENTAGE_TOLERANCE) {
    return {
      valid: false,
      message: `La suma de los porcentajes (${sum.toFixed(2)}) debe ser 100`,
    };
  }
  return { valid: true };
}

/**
 * Calcula `shareAmount` a partir de `sharePercentage` para cada participante,
 * con el mismo ajuste de céntimos sobrantes que `resolveEqualSplit` (orden
 * estable, primeros N participantes en el orden recibido).
 */
export function resolvePercentageSplit(
  amount: number,
  participants: PercentageParticipantInput[],
): ResolvedSplit[] {
  const totalCents = toCents(amount);
  const rawCents = participants.map((p) => (p.sharePercentage / 100) * totalCents);
  const baseCents = rawCents.map((c) => Math.floor(c));
  const allocated = baseCents.reduce((acc, c) => acc + c, 0);
  const remainder = totalCents - allocated;

  return participants.map((p, i) => ({
    memberId: p.memberId,
    shareAmount: fromCents(baseCents[i] + (i < remainder ? 1 : 0)),
    sharePercentage: p.sharePercentage,
  }));
}
