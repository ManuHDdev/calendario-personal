import type { Gasto, TotalesPorMes } from '../types';
import { mesCorto, mesDe } from './formato';
import { normalizar } from './autocomplete';

const round2 = (n: number) => Math.round(n * 100) / 100;

export const SIN_FECHA = 'sin-fecha';

export interface GrupoMes {
  mes: string; // YYYY-MM, or SIN_FECHA
  items: Gasto[];
  gastos: number;
  ganancias: number;
}

/** Groups by month (newest month first), keeping the incoming order inside each month. */
export function agruparPorMes(movimientos: Gasto[]): GrupoMes[] {
  const grupos = new Map<string, GrupoMes>();
  for (const g of movimientos) {
    const clave = mesDe(g.fecha) ?? SIN_FECHA;
    let grupo = grupos.get(clave);
    if (!grupo) {
      grupo = { mes: clave, items: [], gastos: 0, ganancias: 0 };
      grupos.set(clave, grupo);
    }
    grupo.items.push(g);
    if (g.tipo === 'ganancia') grupo.ganancias += g.importe;
    else grupo.gastos += g.importe;
  }
  const lista = [...grupos.values()];
  for (const grupo of lista) {
    grupo.gastos = round2(grupo.gastos);
    grupo.ganancias = round2(grupo.ganancias);
  }
  return lista.sort((a, b) => {
    if (a.mes === SIN_FECHA) return 1;
    if (b.mes === SIN_FECHA) return -1;
    return b.mes.localeCompare(a.mes);
  });
}

/** Client-side search over merchant, concept and category (case and accent insensitive). */
export function filtrarBusqueda(movimientos: Gasto[], busqueda: string): Gasto[] {
  const q = normalizar(busqueda);
  if (!q) return movimientos;
  return movimientos.filter((g) =>
    [g.comercio, g.concepto ?? '', g.categoria ?? ''].some((campo) => normalizar(campo).includes(q)),
  );
}

export interface MesTira {
  mes: string; // YYYY-MM
  numero: number; // 1-12
  etiqueta: string; // "Ene"
  conMovimientos: boolean;
}

/** The twelve month buttons of the period bar; `porMes` may be missing while loading. */
export function construirTiraMeses(anio: number, porMes: TotalesPorMes[] | undefined): MesTira[] {
  const porClave = new Map((porMes ?? []).map((m) => [m.mes, m]));
  return Array.from({ length: 12 }, (_, i) => {
    const numero = i + 1;
    const mes = `${anio}-${String(numero).padStart(2, '0')}`;
    const datos = porClave.get(mes);
    return {
      mes,
      numero,
      etiqueta: mesCorto(numero),
      conMovimientos: !!datos && (datos.gastos > 0 || datos.ganancias > 0),
    };
  });
}

export interface FilaResumenAnual {
  mes: string;
  numero: number;
  etiqueta: string;
  gastos: number;
  ganancias: number;
  balance: number;
  anchoGastos: number; // 0-100, relative to the largest bar of the year
  anchoGanancias: number; // 0-100
  vacio: boolean;
}

/** Rows of the "month by month" overview with bar widths scaled to the biggest value of the year. */
export function construirResumenAnual(porMes: TotalesPorMes[]): FilaResumenAnual[] {
  const maximo = porMes.reduce((max, m) => Math.max(max, m.gastos, m.ganancias), 0);
  const ancho = (v: number) => (maximo > 0 && v > 0 ? Math.max(2, Math.round((v / maximo) * 100)) : 0);
  return porMes.map((m, i) => ({
    mes: m.mes,
    numero: i + 1,
    etiqueta: mesCorto(i + 1),
    gastos: m.gastos,
    ganancias: m.ganancias,
    balance: round2(m.ganancias - m.gastos),
    anchoGastos: ancho(m.gastos),
    anchoGanancias: ancho(m.ganancias),
    vacio: m.gastos === 0 && m.ganancias === 0,
  }));
}

/** "Por pagar" / "Por cobrar" totals of the forecasts. */
export function totalesPrevistos(previstos: Gasto[]): { porPagar: number; porCobrar: number } {
  let porPagar = 0;
  let porCobrar = 0;
  for (const g of previstos) {
    if (g.tipo === 'ganancia') porCobrar += g.importe;
    else porPagar += g.importe;
  }
  return { porPagar: round2(porPagar), porCobrar: round2(porCobrar) };
}
