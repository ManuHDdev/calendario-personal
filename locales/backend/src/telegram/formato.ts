/**
 * Cómo se cuenta un veredicto por Telegram.
 *
 * Puro y testeable: el formateo de un mensaje que decide si vas a ver un local
 * merece tests igual que el cálculo.
 */

import { AVISO_NO_CERTIFICA } from '../viabilidad';
import type { Medicion, ResultadoViabilidad, Veredicto } from '../types/locales';

const EMOJI: Record<Veredicto, string> = {
  verde: '🟢',
  ambar: '🟡',
  rojo: '🔴',
  sin_datos: '⚪',
};

const TITULO: Record<Veredicto, string> = {
  verde: 'Cumple las distancias',
  ambar: 'No se puede decidir con este dato',
  rojo: 'No cumple las distancias',
  sin_datos: 'No se ha podido calcular',
};

function lineaMedicion(m: Medicion, i: number): string {
  const nombre = m.establecimiento.nombre?.trim() || 'sin nombre';
  const dist = m.metros === null ? 'sin ruta peatonal' : `${Math.round(m.metros)} m`;
  const dir = m.establecimiento.direccion ? ` — ${m.establecimiento.direccion}` : '';
  return `${i + 1}. ${nombre}: ${dist}${dir}`;
}

export interface OpcionesMensaje {
  /** Qué punto se ha comprobado, tal como lo entendió el sistema. */
  descripcionPunto?: string | null;
  /** Cuántas cercanas listar. */
  maxListado?: number;
}

export function formatearVeredicto(
  r: ResultadoViabilidad,
  opciones: OpcionesMensaje = {},
): string {
  const max = opciones.maxListado ?? 5;
  const partes: string[] = [];

  partes.push(`${EMOJI[r.veredicto]} *${TITULO[r.veredicto]}*`);

  if (opciones.descripcionPunto) {
    partes.push(`📍 ${opciones.descripcionPunto}`);
  }

  const u = r.umbrales;
  const umbralTexto = [
    u.distanciaFarmaciasM !== null ? `farmacias ${u.distanciaFarmaciasM} m` : null,
    u.distanciaCentrosSanitariosM !== null
      ? `centros sanitarios ${u.distanciaCentrosSanitariosM} m`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  if (umbralTexto) {
    partes.push(`Umbrales aplicados (${u.comunidad ?? 'sin comunidad'}): ${umbralTexto}`);
  }

  partes.push(r.motivo);

  if (r.farmacias.length > 0) {
    partes.push(
      ['*Farmacias más cercanas:*', ...r.farmacias.slice(0, max).map(lineaMedicion)].join('\n'),
    );
  }
  if (r.centros.length > 0) {
    partes.push(
      ['*Centros sanitarios más cercanos:*', ...r.centros.slice(0, max).map(lineaMedicion)].join('\n'),
    );
  }

  partes.push(`_${AVISO_NO_CERTIFICA}_`);

  return partes.join('\n\n');
}

/** Ayuda del bot: se manda con /start, /ayuda y ante lo que no entiende. */
export const AYUDA = [
  '*Locales — comprobador de distancias para farmacia*',
  '',
  'Puedes mandarme:',
  '📍 Una *ubicación* (clip → Ubicación) y te digo qué hay cerca.',
  '✍️ `/comprobar Calle Mayor 12, Madrid` — con número de portal el cálculo es fino.',
  '',
  'Te contesto con las farmacias y centros sanitarios más cercanos, los metros ' +
    '*caminando* (no en línea recta) y si cumple la distancia mínima de esa comunidad.',
  '',
  '🟢 cumple incluso en el peor caso · 🔴 incumple incluso en el mejor · ' +
    '🟡 el dato no permite decidir, hay que mirarlo.',
].join('\n');
