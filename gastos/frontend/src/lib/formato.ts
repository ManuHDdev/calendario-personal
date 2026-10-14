import type { Tipo } from '../types';

const NBSP = ' ';
const MINUS = '−';

const MESES_LARGO = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const DIAS_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export interface FechaPartes {
  anio: number;
  mes: number; // 1-12
  dia: number;
}

/** Parses the leading YYYY-MM-DD of a date string without going through Date (no timezone shifts). */
export function parseFecha(fecha: string | null | undefined): FechaPartes | null {
  if (!fecha) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (!m) return null;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return { anio, mes, dia };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date of "today" as YYYY-MM-DD. */
export function hoyLocal(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** YYYY-MM of a YYYY-MM-DD string, or null. */
export function mesDe(fecha: string | null | undefined): string | null {
  const p = parseFecha(fecha);
  return p ? `${p.anio}-${pad(p.mes)}` : null;
}

export function mesLargo(mes: number): string {
  return MESES_LARGO[mes - 1] ?? '';
}

export function mesCorto(mes: number): string {
  return MESES_CORTO[mes - 1] ?? '';
}

export function capitalizar(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** "Octubre" for a YYYY-MM key. */
export function nombreMes(ym: string): string {
  const p = parseFecha(`${ym}-01`);
  return p ? capitalizar(mesLargo(p.mes)) : '';
}

/** "octubre de 2026" for a YYYY-MM key. */
export function nombreMesConAnio(ym: string): string {
  const p = parseFecha(`${ym}-01`);
  return p ? `${mesLargo(p.mes)} de ${p.anio}` : '';
}

/** Weekday index 0 (Sunday) - 6, computed from the date parts only. */
function diaSemana(p: FechaPartes): number {
  return new Date(Date.UTC(p.anio, p.mes - 1, p.dia)).getUTCDay();
}

/** { dia: '14', semana: 'mié' } */
export function diaYSemana(fecha: string | null | undefined): { dia: string; semana: string } | null {
  const p = parseFecha(fecha);
  if (!p) return null;
  return { dia: String(p.dia), semana: DIAS_CORTO[diaSemana(p)] };
}

/** "mié 14" */
export function formatDiaSemana(fecha: string | null | undefined): string {
  const d = diaYSemana(fecha);
  return d ? `${d.semana} ${d.dia}` : '';
}

/** "14 de octubre de 2026" */
export function formatFechaLarga(fecha: string | null | undefined): string {
  const p = parseFecha(fecha);
  return p ? `${p.dia} de ${mesLargo(p.mes)} de ${p.anio}` : '';
}

/** "14 oct" */
export function formatFechaCorta(fecha: string | null | undefined): string {
  const p = parseFecha(fecha);
  return p ? `${p.dia} ${mesCorto(p.mes).toLowerCase()}` : '';
}

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** "1.234,50 €" (always groups thousands, unlike Intl's es locale for 4-digit numbers). */
export function formatMoney(value: number): string {
  const cents = Math.round(Math.abs(value) * 100);
  const entero = Math.floor(cents / 100);
  const dec = pad(cents % 100);
  return `${groupThousands(String(entero))},${dec}${NBSP}€`;
}

/** "+1.234,50 €" for income, "−1.234,50 €" for expenses. */
export function formatSignedMoney(value: number, tipo: Tipo): string {
  return `${tipo === 'ganancia' ? '+' : MINUS}${formatMoney(value)}`;
}

/** Sign follows the number itself (used for the balance); zero has no sign. */
export function formatBalance(value: number): string {
  const cents = Math.round(value * 100);
  if (cents === 0) return formatMoney(0);
  return `${cents > 0 ? '+' : MINUS}${formatMoney(value)}`;
}

/** Parses what a person types: "12", "12,5", "1.234,50", "12.50", "1.234". Null when it is not a number. */
export function parseImporte(raw: string): number | null {
  const s = raw.replace(/[€\s ]/g, '');
  if (!s) return null;
  let normalized: string;
  if (s.includes(',')) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    normalized = s.replace(/\./g, '');
  } else {
    normalized = s;
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

/** Value to prefill an amount input with: "12,5" style, no grouping. */
export function importeParaInput(value: number): string {
  return String(value).replace('.', ',');
}

export function pluralMovimientos(n: number): string {
  return n === 1 ? '1 movimiento' : `${n} movimientos`;
}
