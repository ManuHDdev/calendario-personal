import type { Veredicto } from '../types';

export const AVISO_NO_CERTIFICA =
  'Este cálculo es una ayuda para descartar y priorizar, no una medición oficial: ' +
  'el método exacto lo fija el reglamento de cada comunidad. Confírmalo con un técnico antes de decidir.';

interface Info {
  emoji: string;
  texto: string;
  color: string;
}

export const VEREDICTO_INFO: Record<Veredicto, Info> = {
  verde: { emoji: '🟢', texto: 'Cumple en el peor caso', color: '#34c759' },
  ambar: { emoji: '🟡', texto: 'Hay que comprobarlo', color: '#ff9f0a' },
  rojo: { emoji: '🔴', texto: 'Incumple en el mejor caso', color: '#ff3b30' },
  sin_datos: { emoji: '⚪', texto: 'Sin datos para calcular', color: '#8e8e93' },
};

export function Semaforo({ veredicto, grande = false }: { veredicto: Veredicto; grande?: boolean }) {
  const info = VEREDICTO_INFO[veredicto];
  return (
    <span
      className={`semaforo${grande ? ' semaforo--grande' : ''}`}
      style={{ color: info.color }}
    >
      <span className="semaforo-emoji">{info.emoji}</span>
      <span className="semaforo-texto">{info.texto}</span>
    </span>
  );
}

export function AvisoNoCertifica() {
  return <p className="aviso-no-certifica">· {AVISO_NO_CERTIFICA}</p>;
}
