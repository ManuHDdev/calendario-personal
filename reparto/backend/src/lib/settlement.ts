// Simplificación de deudas — algoritmo greedy (design.md "Balances y
// liquidación"): empareja iterativamente el mayor deudor con el mayor
// acreedor hasta que todos los saldos quedan a ~0. No es óptimo en el caso
// general (NP-difícil), pero es la misma heurística que usa Tricount.

export interface Balance {
  memberId: string;
  /** Saldo neto: positivo = le deben (acreedor), negativo = debe (deudor). */
  amount: number;
}

export interface Transfer {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}

// Tolerancia de redondeo: medio céntimo, para no generar transferencias
// espurias por arrastre de coma flotante en sumas intermedias.
const EPSILON = 0.005;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function simplifyDebts(balances: Balance[]): Transfer[] {
  const debtors = balances
    .filter((b) => b.amount < -EPSILON)
    .map((b) => ({ memberId: b.memberId, amount: -b.amount }))
    .sort((a, b) => b.amount - a.amount);

  const creditors = balances
    .filter((b) => b.amount > EPSILON)
    .map((b) => ({ memberId: b.memberId, amount: b.amount }))
    .sort((a, b) => b.amount - a.amount);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = round2(Math.min(debtor.amount, creditor.amount));

    if (amount > EPSILON) {
      transfers.push({ fromMemberId: debtor.memberId, toMemberId: creditor.memberId, amount });
    }

    debtor.amount = round2(debtor.amount - amount);
    creditor.amount = round2(creditor.amount - amount);

    if (debtor.amount <= EPSILON) i++;
    if (creditor.amount <= EPSILON) j++;
  }

  return transfers;
}
