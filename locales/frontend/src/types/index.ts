/**
 * Tipos del frontend de `locales`. Reflejan EXACTAMENTE lo que devuelve el
 * backend (`locales/backend/src/types/locales.ts` + `routes/*.ts`): las filas
 * de búsqueda y anuncio viajan en snake_case tal cual salen de la base de
 * datos; la comprobación de viabilidad viaja en camelCase.
 */

export type TipoBusqueda = 'local' | 'farmacia';
export type Veredicto = 'verde' | 'ambar' | 'rojo' | 'sin_datos';
export type PrecisionCoordenadas = 'exacta' | 'aproximada' | 'desconocida';
export type NombreMotor = 'ors' | 'valhalla';

// ── Portales ────────────────────────────────────────────────────────────────

export const PORTALES_POR_TIPO: Record<TipoBusqueda, readonly string[]> = {
  local: ['fotocasa', 'pisoscom', 'habitaclia', 'yaencontre', 'milanuncios'],
  farmacia: ['farmaconsulting', 'asefarma', 'tablondeanuncios', 'milanuncios-farmacias'],
};

export const NOMBRE_PORTAL: Record<string, string> = {
  fotocasa: 'Fotocasa',
  pisoscom: 'pisos.com',
  habitaclia: 'habitaclia',
  yaencontre: 'yaencontre',
  milanuncios: 'milanuncios',
  farmaconsulting: 'Farmaconsulting',
  asefarma: 'Asefarma',
  tablondeanuncios: 'Tablón de Anuncios',
  'milanuncios-farmacias': 'milanuncios (farmacias)',
};

// ── Búsquedas ───────────────────────────────────────────────────────────────

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

/** Cuerpo de POST /searches — unión discriminada por `tipo` (snake_case). */
export interface BusquedaFormData {
  tipo: TipoBusqueda;
  nombre: string;
  portales: string[];
  comunidad?: string | null;
  provincia?: string | null;
  municipio?: string | null;
  zona_texto?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  radio_km?: number | null;
  comprobar_farmacias?: boolean;
  comprobar_centros_sanitarios?: boolean;
  distancia_farmacias_m?: number | null;
  distancia_centros_sanitarios_m?: number | null;
  habilitada?: boolean;
  notificar?: boolean;
  // local
  precio_min?: number | null;
  precio_max?: number | null;
  superficie_min?: number | null;
  superficie_max?: number | null;
  pie_calle?: boolean | null;
  // farmacia
  facturacion_min?: number | null;
  facturacion_max?: number | null;
}

/** PATCH /searches/:id — parcial, pero `tipo` es obligatorio (elige el arm). */
export type BusquedaUpdateData = Partial<BusquedaFormData> & { tipo: TipoBusqueda };

// ── Anuncios ────────────────────────────────────────────────────────────────

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
  // añadidos por la ruta
  busqueda_nombre?: string;
  precio_m2: number | null;
}

// ── Scraper ─────────────────────────────────────────────────────────────────

export interface ScraperState {
  running: boolean;
  updated_at: string;
}

export interface ResultadoRastreo {
  encontrados: number;
  guardados: number;
  fallos: Array<{ portal: string; motivo: string }>;
  omitidos: Array<{ portal: string; motivo: string }>;
}

// ── Viabilidad ──────────────────────────────────────────────────────────────

export interface PuntoConPrecision {
  lat: number;
  lng: number;
  precision: PrecisionCoordenadas;
}

export interface Establecimiento {
  id: number;
  lat: number;
  lng: number;
  nombre: string | null;
  direccion: string | null;
  municipio: string | null;
  precision: PrecisionCoordenadas;
  fuente: string;
}

export interface Medicion {
  establecimiento: Establecimiento;
  metros: number | null;
  decisiva: boolean;
}

export interface Umbrales {
  comunidad: string | null;
  distanciaFarmaciasM: number | null;
  distanciaCentrosSanitariosM: number | null;
  origen: 'normativa' | 'busqueda' | 'mixto';
  verificado: boolean;
  fuenteUrl: string | null;
  notas: string | null;
}

/** Respuesta de POST /viabilidad/comprobar. */
export interface ResultadoViabilidad {
  punto: PuntoConPrecision;
  veredicto: Veredicto;
  motivo: string;
  farmaciaMasCercana: Medicion | null;
  centroMasCercano: Medicion | null;
  farmacias: Medicion[];
  centros: Medicion[];
  umbrales: Umbrales;
  motor: NombreMotor | null;
  calculadoEn: string;
  aviso: string;
}

export interface ComprobarBody {
  latitud?: number;
  longitud?: number;
  direccion?: string;
  comunidad?: string;
  provincia?: string;
  municipio?: string;
  comprobarFarmacias?: boolean;
  comprobarCentrosSanitarios?: boolean;
  distanciaFarmaciasM?: number | null;
  distanciaCentrosSanitariosM?: number | null;
}

export interface EstadoPresupuesto {
  motor: NombreMotor;
  usadas: number;
  tope: number | null;
  disponibles: number | null;
}

// ── Normativa ───────────────────────────────────────────────────────────────

export interface Normativa {
  comunidad: string;
  zonaExcepcion: string | null;
  distanciaFarmaciasM: number | null;
  distanciaCentrosSanitariosM: number | null;
  verificado: boolean;
  fuenteUrl: string | null;
  notas: string | null;
}

export interface NormativaUpdate {
  distanciaFarmaciasM?: number;
  distanciaCentrosSanitariosM?: number | null;
  verificado?: boolean;
  fuenteUrl?: string | null;
  notas?: string | null;
}

// ── Padrón ──────────────────────────────────────────────────────────────────

export interface CoberturaMunicipio {
  municipio: string;
  provincia: string | null;
  farmacias_conocidas: number;
  poblacion: number | null;
  farmacias_esperadas: number | null;
  suficiente: boolean;
  motivo: string | null;
  calculado_en: string | null;
}

export interface PadronResumen {
  farmacias: Array<{
    comunidad: string;
    fuente: string;
    total: number;
    duplicados: number;
    ultima_importacion: string | null;
  }>;
  centros: Array<{
    comunidad: string;
    fuente: string;
    total: number;
    ultima_importacion: string | null;
  }>;
}
