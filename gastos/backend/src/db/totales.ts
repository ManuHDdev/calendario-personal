export type TipoMovimiento = 'gasto' | 'ganancia';

export interface FilaTotalCategoria {
  tipo: TipoMovimiento;
  categoria: string;
  total: string | number;
}

export interface FilaTotalMes {
  mes: string; // YYYY-MM
  tipo: TipoMovimiento;
  total: string | number;
}

export interface TotalesPeriodo {
  periodo: 'mes' | 'anio';
  mes?: string;
  anio?: string;
  gastos: number;
  ganancias: number;
  balance: number;
  /** Igual que `gastos`; se mantiene para frontends anteriores a `tipo`. */
  total: number;
  porCategoria: { categoria: string; tipo: TipoMovimiento; total: number }[];
  /** Solo para `anio`: siempre 12 entradas YYYY-01..YYYY-12 rellenas con 0. */
  porMes?: { mes: string; gastos: number; ganancias: number }[];
}

// Los SUM llegan como numeric; se redondea a céntimos para que sumar varios
// grupos no arrastre ruido de coma flotante (0.1 + 0.2).
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Monta la respuesta de GET /totales a partir de las filas agregadas (ya
 * limitadas a confirmado + activo por la query). Es pura para poder
 * probarla sin base de datos.
 */
export function assembleTotales(
  periodo: { mes?: string; anio?: string },
  filasCategoria: FilaTotalCategoria[],
  filasMes: FilaTotalMes[] = [],
): TotalesPeriodo {
  let gastos = 0;
  let ganancias = 0;
  const porCategoria = filasCategoria.map((r) => {
    const total = Number(r.total);
    if (r.tipo === 'ganancia') ganancias += total;
    else gastos += total;
    return { categoria: r.categoria, tipo: r.tipo, total: round2(total) };
  });
  gastos = round2(gastos);
  ganancias = round2(ganancias);

  const base = {
    gastos,
    ganancias,
    balance: round2(ganancias - gastos),
    total: gastos,
    porCategoria,
  };

  if (periodo.mes) {
    return { periodo: 'mes', mes: periodo.mes, ...base };
  }

  const anio = periodo.anio as string;
  const meses = new Map<string, { mes: string; gastos: number; ganancias: number }>();
  for (let m = 1; m <= 12; m++) {
    const mes = `${anio}-${String(m).padStart(2, '0')}`;
    meses.set(mes, { mes, gastos: 0, ganancias: 0 });
  }
  for (const r of filasMes) {
    const entrada = meses.get(r.mes);
    if (!entrada) continue;
    if (r.tipo === 'ganancia') entrada.ganancias = round2(entrada.ganancias + Number(r.total));
    else entrada.gastos = round2(entrada.gastos + Number(r.total));
  }
  return { periodo: 'anio', anio, ...base, porMes: [...meses.values()] };
}
