import { pool } from './pool';
import { construirModelo, type ObservacionLite } from '../services/modelo';
import type { Color, ManualAcceso, ModeloAcceso } from '../types/semaforos';

interface CruceRow {
  id: number;
  osm_id: string;
  ciudad: string;
  nombre: string;
  lat: number;
  lng: number;
}

interface AccesoRow {
  id: number;
  cruce_id: number;
  nombre: string;
  rumbo_grados: number | null;
  verde_manual_s: string | null;
  ambar_manual_s: string | null;
  rojo_manual_s: string | null;
}

interface ObservacionRow {
  id: number;
  acceso_id: number;
  color: Color;
  observado_at: Date;
}

/** ResponseDTO: nunca incluye deleted_at. */
export interface AccesoDTO {
  id: number;
  cruce_id: number;
  nombre: string;
  rumbo_grados: number | null;
  manual: ManualAcceso;
  modelo: ModeloAcceso;
}

export interface CruceDTO {
  id: number;
  ciudad: string;
  nombre: string;
  lat: number;
  lng: number;
  accesos: AccesoDTO[];
}

export interface ObservacionDTO {
  id: number;
  color: Color;
  observado_at: string;
}

/** NUMERIC llega como string desde pg; el contrato de la API es numero. */
const num = (v: string | null): number | null => (v === null ? null : Number(v));

function manualDe(a: AccesoRow): ManualAcceso {
  return { verde: num(a.verde_manual_s), ambar: num(a.ambar_manual_s), rojo: num(a.rojo_manual_s) };
}

function accesoDTO(a: AccesoRow, obs: ObservacionRow[]): AccesoDTO {
  const lite: ObservacionLite[] = obs.map((o) => ({ color: o.color, t: o.observado_at.getTime() }));
  return {
    id: a.id,
    cruce_id: a.cruce_id,
    nombre: a.nombre,
    rumbo_grados: a.rumbo_grados,
    manual: manualDe(a),
    modelo: construirModelo(lite, manualDe(a)),
  };
}

function agrupar<T, K>(items: T[], clave: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of items) {
    const k = clave(it);
    const lista = m.get(k);
    if (lista) lista.push(it);
    else m.set(k, [it]);
  }
  return m;
}

export async function listarCruces(ciudad?: string): Promise<CruceDTO[]> {
  const filtro = ciudad ?? null;
  const cruces = await pool.query<CruceRow>(
    `SELECT id, osm_id, ciudad, nombre, lat, lng FROM cruce
      WHERE activo = TRUE AND ($1::text IS NULL OR ciudad = $1)
      ORDER BY id`,
    [filtro],
  );
  const accesos = await pool.query<AccesoRow>(
    `SELECT a.id, a.cruce_id, a.nombre, a.rumbo_grados, a.verde_manual_s, a.ambar_manual_s, a.rojo_manual_s
       FROM acceso a JOIN cruce c ON c.id = a.cruce_id
      WHERE a.activo = TRUE AND c.activo = TRUE AND ($1::text IS NULL OR c.ciudad = $1)
      ORDER BY a.id`,
    [filtro],
  );
  const obs = await pool.query<ObservacionRow>(
    `SELECT o.id, o.acceso_id, o.color, o.observado_at
       FROM observacion o
       JOIN acceso a ON a.id = o.acceso_id
       JOIN cruce c ON c.id = a.cruce_id
      WHERE o.activo = TRUE AND a.activo = TRUE AND c.activo = TRUE AND ($1::text IS NULL OR c.ciudad = $1)
      ORDER BY o.observado_at`,
    [filtro],
  );

  const obsPorAcceso = agrupar(obs.rows, (o) => o.acceso_id);
  const accesosPorCruce = agrupar(accesos.rows, (a) => a.cruce_id);

  return cruces.rows.map((c) => ({
    id: c.id,
    ciudad: c.ciudad,
    nombre: c.nombre,
    lat: c.lat,
    lng: c.lng,
    accesos: (accesosPorCruce.get(c.id) ?? []).map((a) => accesoDTO(a, obsPorAcceso.get(a.id) ?? [])),
  }));
}

export async function obtenerAcceso(id: number): Promise<AccesoDTO | null> {
  const a = await pool.query<AccesoRow>(
    `SELECT a.id, a.cruce_id, a.nombre, a.rumbo_grados, a.verde_manual_s, a.ambar_manual_s, a.rojo_manual_s
       FROM acceso a JOIN cruce c ON c.id = a.cruce_id
      WHERE a.id = $1 AND a.activo = TRUE AND c.activo = TRUE`,
    [id],
  );
  if (a.rows.length === 0) return null;
  const obs = await pool.query<ObservacionRow>(
    `SELECT id, acceso_id, color, observado_at FROM observacion
      WHERE acceso_id = $1 AND activo = TRUE ORDER BY observado_at`,
    [id],
  );
  return accesoDTO(a.rows[0], obs.rows);
}

export async function listarObservaciones(accesoId: number, limite = 60): Promise<ObservacionDTO[]> {
  const r = await pool.query<ObservacionRow>(
    `SELECT id, acceso_id, color, observado_at FROM observacion
      WHERE acceso_id = $1 AND activo = TRUE ORDER BY observado_at DESC LIMIT $2`,
    [accesoId, limite],
  );
  return r.rows.map((o) => ({ id: o.id, color: o.color, observado_at: o.observado_at.toISOString() }));
}

export async function listarCiudades(): Promise<Array<{ ciudad: string; cruces: number }>> {
  const r = await pool.query<{ ciudad: string; cruces: string }>(
    `SELECT ciudad, COUNT(*) AS cruces FROM cruce WHERE activo = TRUE GROUP BY ciudad ORDER BY ciudad`,
  );
  return r.rows.map((x) => ({ ciudad: x.ciudad, cruces: Number(x.cruces) }));
}
