/**
 * Cómo se cuenta un veredicto por Telegram.
 *
 * Puro y testeable: el formateo de un mensaje que decide si vas a ver un local
 * merece tests igual que el cálculo.
 */

import { AVISO_NO_CERTIFICA } from '../viabilidad';
import type { Medicion, ResultadoViabilidad, Veredicto } from '../types/locales';
import type { NovedadAnuncio } from '../services/rastreo';

export const EMOJI: Record<Veredicto, string> = {
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

function escaparMd(texto: string): string {
  return texto.replace(/([_*`\[\]])/g, '\\$1');
}

function euros(valor: number | null): string {
  if (valor === null) return '—';
  return `${valor.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`;
}

/**
 * Aviso de un anuncio nuevo o de una bajada de precio.
 *
 * Ámbar se avisa igual que verde (marcado como "hay que confirmarlo"): el bot
 * existe para convertir ese ámbar en verde o rojo. Rojo y sin_datos NO se
 * avisan — eso lo filtra `notificarNovedades`, no esta función.
 */
export function formatearNovedad(novedad: NovedadAnuncio, nombreBusqueda: string): string {
  const { anuncio, tipo } = novedad;
  const esFarmacia = anuncio.tipo === 'farmacia';
  const partes: string[] = [];

  const cabecera =
    tipo === 'bajada'
      ? `📉 *Bajada de precio* · ${escaparMd(nombreBusqueda)}`
      : `${EMOJI[anuncio.veredicto] ?? '🟢'} *${esFarmacia ? 'Farmacia nueva' : 'Local nuevo'}* · ${escaparMd(nombreBusqueda)}`;
  partes.push(cabecera);

  if (anuncio.titulo) partes.push(`*${escaparMd(anuncio.titulo)}*`);

  if (anuncio.veredicto === 'ambar') {
    partes.push(`${EMOJI.ambar} Necesita confirmación — ${anuncio.veredicto_motivo ?? ''}`.trim());
  } else if (anuncio.veredicto_motivo) {
    partes.push(`${EMOJI[anuncio.veredicto] ?? ''} ${anuncio.veredicto_motivo}`.trim());
  }

  const precio =
    tipo === 'bajada' && anuncio.precio_anterior !== null
      ? `💶 ${euros(anuncio.precio)} (antes ${euros(anuncio.precio_anterior)})`
      : `💶 ${euros(anuncio.precio)}`;
  partes.push(precio);

  if (esFarmacia) {
    if (anuncio.facturacion !== null) partes.push(`💰 Facturación ${euros(anuncio.facturacion)}`);
  } else if (anuncio.superficie_m2 !== null) {
    partes.push(`📐 ${anuncio.superficie_m2} m²`);
  }

  const lugar = [anuncio.municipio, anuncio.provincia].filter(Boolean).join(', ');
  if (lugar) partes.push(`📍 ${escaparMd(lugar)}`);

  if (anuncio.distancia_farmacia_m !== null) {
    partes.push(`🚶 A ${anuncio.distancia_farmacia_m} m de la farmacia más cercana`);
  }

  partes.push(`🔗 ${anuncio.portal}: ${anuncio.url}`);
  partes.push(`_${AVISO_NO_CERTIFICA}_`);

  return partes.join('\n');
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
