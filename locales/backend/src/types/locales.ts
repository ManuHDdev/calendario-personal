/** Tipos compartidos por todo el backend de `locales`. */

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Cuánto vale una coordenada para decidir a escala de 250 metros.
 *
 * No es un detalle cosmético: es la entrada que fija el margen de
 * incertidumbre del veredicto. Un portal que ofusca la ubicación produce
 * `aproximada`, y con eso NO se puede afirmar que un local cumple.
 */
export type PrecisionCoordenadas = 'exacta' | 'aproximada' | 'desconocida';

export type Veredicto = 'verde' | 'ambar' | 'rojo' | 'sin_datos';

export type TipoBusqueda = 'local' | 'farmacia';

export type NombreMotor = 'ors' | 'valhalla';

export interface PuntoConPrecision extends LatLng {
  precision: PrecisionCoordenadas;
}

/** Una farmacia o centro sanitario del padrón, tal como lo usa el cálculo. */
export interface Establecimiento extends LatLng {
  id: number;
  nombre: string | null;
  direccion: string | null;
  municipio: string | null;
  precision: PrecisionCoordenadas;
  fuente: string;
}

/** Umbrales legales aplicables a un punto concreto. */
export interface Umbrales {
  comunidad: string | null;
  /** Metros mínimos a otra farmacia. `null` = no se comprueba. */
  distanciaFarmaciasM: number | null;
  /** Metros mínimos a un centro sanitario. `null` = no se comprueba. */
  distanciaCentrosSanitariosM: number | null;
  /** De dónde salen: la comunidad, o una sobreescritura de la búsqueda. */
  origen: 'normativa' | 'busqueda' | 'mixto';
  verificado: boolean;
  fuenteUrl: string | null;
  notas: string | null;
}

/** Resultado de medir un establecimiento concreto desde el punto de interés. */
export interface Medicion {
  establecimiento: Establecimiento;
  /** Metros caminando. `null` = el motor no encontró ruta peatonal. */
  metros: number | null;
  /**
   * Si esta candidata puede cambiar el veredicto.
   *
   * Dentro del radio decisivo (umbral + margen de incertidumbre) sí: no
   * haberla medido obliga a degradar a ámbar. Fuera, la medición es solo
   * informativa — sirve para decir "la más cercana está a X m" y su ausencia
   * no oculta ningún incumplimiento.
   */
  decisiva: boolean;
}

/**
 * Un anuncio tal y como lo devuelve un portal, antes de tocar la base de
 * datos ni el cálculo de viabilidad.
 *
 * Regla transversal (la misma que el padrón): lo que el portal no informa
 * viaja como `null`, nunca como un valor por defecto. `facturacion` solo la
 * traen los portales de farmacias; `superficieM2` y `precio`, sobre todo los
 * de locales. Una farmacia intermediada a menudo llega sin coordenadas —eso
 * es su forma normal, no un error— y entonces `precision` es `'desconocida'`.
 */
export interface AnuncioCrudo {
  tipo: TipoBusqueda;
  portal: string;
  portalId: string;
  url: string;
  titulo: string;
  descripcion: string | null;
  precio: number | null;
  precioAnterior: number | null;
  superficieM2: number | null;
  facturacion: number | null;
  direccion: string | null;
  municipio: string | null;
  provincia: string | null;
  comunidad: string | null;
  latitud: number | null;
  longitud: number | null;
  precision: PrecisionCoordenadas;
  imagenUrl: string | null;
}

/**
 * Una búsqueda guardada, tal y como sale de la base de datos (columnas en
 * snake_case, NUMERIC ya convertido a número por `normalizarFila`).
 */
export interface Busqueda {
  id: number;
  nombre: string;
  tipo: TipoBusqueda;
  comunidad: string | null;
  provincia: string | null;
  municipio: string | null;
  zona_texto: string | null;
  latitud: number | null;
  longitud: number | null;
  radio_km: number | null;
  precio_min: number | null;
  precio_max: number | null;
  superficie_min: number | null;
  superficie_max: number | null;
  pie_calle: boolean | null;
  facturacion_min: number | null;
  facturacion_max: number | null;
  comprobar_farmacias: boolean;
  comprobar_centros_sanitarios: boolean;
  distancia_farmacias_m: number | null;
  distancia_centros_sanitarios_m: number | null;
  portales: string[];
  habilitada: boolean;
  notificar: boolean;
  ultimo_rastreo: string | null;
  ultimo_rastreo_error: string | null;
  created_at: string;
  updated_at: string;
}

/** Un anuncio ya guardado (la fila de `anuncio`). */
export interface Anuncio {
  id: number;
  busqueda_id: number;
  tipo: TipoBusqueda;
  portal: string;
  portal_id: string;
  url: string;
  titulo: string | null;
  descripcion: string | null;
  precio: number | null;
  precio_anterior: number | null;
  superficie_m2: number | null;
  facturacion: number | null;
  imagen_url: string | null;
  direccion: string | null;
  municipio: string | null;
  provincia: string | null;
  comunidad: string | null;
  latitud: number | null;
  longitud: number | null;
  precision_coordenadas: PrecisionCoordenadas;
  veredicto: Veredicto;
  veredicto_motivo: string | null;
  distancia_farmacia_m: number | null;
  farmacia_mas_cercana_id: number | null;
  distancia_centro_m: number | null;
  centro_mas_cercano_id: number | null;
  viabilidad_calculada_en: string | null;
  viabilidad_motor: string | null;
  visto: boolean;
  descartado: boolean;
  notificado: boolean;
  created_at: string;
  updated_at: string;
}

/** Columnas de viabilidad que el rastreo escribe junto al anuncio. */
export interface ViabilidadColumnas {
  veredicto: Veredicto;
  veredicto_motivo: string | null;
  distancia_farmacia_m: number | null;
  farmacia_mas_cercana_id: number | null;
  distancia_centro_m: number | null;
  centro_mas_cercano_id: number | null;
  viabilidad_calculada_en: Date | null;
  viabilidad_motor: string | null;
}

export interface ResultadoViabilidad {
  veredicto: Veredicto;
  motivo: string;
  /** La farmacia más cercana medida, si se llegó a medir alguna. */
  farmaciaMasCercana: Medicion | null;
  centroMasCercano: Medicion | null;
  /** Todas las mediciones, ordenadas de más cerca a más lejos. */
  farmacias: Medicion[];
  centros: Medicion[];
  umbrales: Umbrales;
  motor: NombreMotor | null;
  calculadoEn: Date;
}
