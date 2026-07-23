export interface GeocodeResult {
  latitud: number;
  longitud: number;
}

/**
 * Resuelve un nombre de ciudad a coordenadas usando el geocodificador
 * gratuito de OpenStreetMap (Nominatim). Requiere un User-Agent descriptivo
 * por su política de uso — un fetch de servidor sí puede fijarlo, a
 * diferencia de un fetch desde el navegador.
 */
export async function geocodeCiudad(nombre: string): Promise<GeocodeResult> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(nombre)}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'MapaCYD/1.0 (app familiar de zonas de carga y descarga)' },
  });
  if (!res.ok) {
    throw new Error(`Error del geocodificador: ${res.status}`);
  }
  const results = (await res.json()) as { lat: string; lon: string }[];
  if (results.length === 0) {
    throw new Error(`No se ha encontrado la ciudad "${nombre}"`);
  }
  return { latitud: parseFloat(results[0].lat), longitud: parseFloat(results[0].lon) };
}
