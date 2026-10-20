export type Color = 'verde' | 'ambar' | 'rojo';

export const COLORES: readonly Color[] = ['verde', 'ambar', 'rojo'];

/** Orden fijo de un semaforo: verde -> ambar -> rojo -> verde. */
export const SIGUIENTE: Record<Color, Color> = {
  verde: 'ambar',
  ambar: 'rojo',
  rojo: 'verde',
};

/**
 * Franja: tipo de dia x bloque horario, en hora de Madrid. Los semaforos
 * cambian de plan (punta de manana, noche, fin de semana), asi que sus
 * duraciones se estiman por franja y no con una unica media.
 */
export type Franja =
  | 'laborable-manana' | 'laborable-tarde' | 'laborable-noche'
  | 'finde-manana' | 'finde-tarde' | 'finde-noche';

export const FRANJAS: readonly Franja[] = [
  'laborable-manana', 'laborable-tarde', 'laborable-noche',
  'finde-manana', 'finde-tarde', 'finde-noche',
];

export interface EstimacionColor {
  /** Fases completas observadas de este color. */
  n: number;
  mediana: number | null;
  min: number | null;
  max: number | null;
  /** Desviacion absoluta mediana: mide cuanto varia, sin dejarse arrastrar por un atipico. */
  mad: number | null;
  /** Correccion a mano; si existe manda sobre la mediana. */
  manual: number | null;
  /** manual ?? mediana: el valor que usa la prediccion. */
  efectiva: number | null;
}

export interface ModeloFranja {
  verde: EstimacionColor;
  ambar: EstimacionColor;
  rojo: EstimacionColor;
  /** true si los tres colores son lo bastante estables como para predecir con cuenta atras exacta. */
  fijo: boolean;
}

export interface ModeloAcceso {
  global: ModeloFranja;
  franjas: Partial<Record<Franja, ModeloFranja>>;
  /** Ultimo cambio observado (ms epoch); desde ahi se proyecta el estado actual. */
  ultima: { color: Color; t: number } | null;
  totalObservaciones: number;
}

export interface ManualAcceso {
  verde: number | null;
  ambar: number | null;
  rojo: number | null;
}
