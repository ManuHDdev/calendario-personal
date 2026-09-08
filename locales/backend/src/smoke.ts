/**
 * Comprobación manual contra los portales REALES.
 *
 * Los tests de vitest de este backend corren contra fixtures embebidos: prueban
 * la LÓGICA de parseo, pero no que un portal siga sirviendo hoy lo esperado —
 * CI no sale a internet, y el entorno de desarrollo tampoco. Este script es ese
 * eslabón: golpea el portal de verdad y enseña la COBERTURA POR CAMPO, que es
 * la métrica real (un parser medio roto devuelve anuncios con todo a null y aun
 * así "no falla").
 *
 *   npm run smoke -- fotocasa "Badajoz"
 *   npm run smoke -- locales "Madrid" --max 250000 --sup 80
 *   npm run smoke -- farmacias "Madrid"
 *   npm run smoke -- todos "Málaga"
 */

import {
  PROVIDERS_LOCAL,
  PROVIDERS_FARMACIA,
  getProvider,
} from './portales';
import type { CriteriosPortal } from './portales/types';
import type { AnuncioCrudo } from './types/locales';

function leerOpcion(args: string[], nombre: string): number | null {
  const indice = args.indexOf(`--${nombre}`);
  if (indice === -1 || indice === args.length - 1) return null;
  const valor = Number(args[indice + 1]);
  return Number.isFinite(valor) ? valor : null;
}

const CAMPOS: Array<[string, keyof AnuncioCrudo]> = [
  ['precio', 'precio'],
  ['superficie', 'superficieM2'],
  ['facturación', 'facturacion'],
  ['imagen', 'imagenUrl'],
];

async function probar(portalId: string, criterios: CriteriosPortal): Promise<void> {
  const provider = getProvider(portalId);
  if (!provider) {
    console.log(`\n══ ${portalId}: portal desconocido`);
    return;
  }
  console.log(`\n══ ${provider.nombre} ${'═'.repeat(Math.max(0, 46 - provider.nombre.length))}`);

  const disponibilidad = provider.puedeBuscar({ ...criterios, tipo: provider.tipo });
  if (!disponibilidad.ok) {
    console.log(`  ⏭  omitido: ${disponibilidad.motivo}`);
    return;
  }

  const inicio = Date.now();
  try {
    const anuncios = await provider.buscar({ ...criterios, tipo: provider.tipo }, { maxPaginas: 1 });
    console.log(`  ✅ ${anuncios.length} anuncio(s) en ${Date.now() - inicio} ms`);

    if (anuncios.length === 0) {
      console.log(
        '  ⚠️  Cero resultados. O la zona no tiene nada, o el portal ha cambiado su\n' +
          `     estructura: revisa el bloque ───── en portales/${portalId}.ts`,
      );
      return;
    }

    const cobertura = (campo: keyof AnuncioCrudo) =>
      `${anuncios.filter((a) => a[campo] !== null).length}/${anuncios.length}`;
    const coords = `${anuncios.filter((a) => a.latitud !== null && a.longitud !== null).length}/${anuncios.length}`;
    console.log(
      '  📊 ' +
        CAMPOS.map(([etq, campo]) => `${etq} ${cobertura(campo)}`).join(' · ') +
        ` · coords ${coords}`,
    );

    for (const a of anuncios.slice(0, 3)) {
      console.log(
        `\n  • ${a.titulo}\n` +
          `    ${a.precio ?? '?'} € · ${a.superficieM2 ?? '?'} m² · fact. ${a.facturacion ?? '?'} · ` +
          `${a.precision}\n` +
          `    ${[a.direccion, a.municipio, a.provincia].filter(Boolean).join(', ') || 'sin ubicación'}\n` +
          `    ${a.url}`,
      );
    }
  } catch (err) {
    console.log(`  ❌ ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const objetivo = args[0];
  const zona = args[1];

  if (!objetivo || !zona) {
    console.error(
      'Uso: npm run smoke -- <portal|locales|farmacias|todos> "<zona>" ' +
        '[--min N --max N --sup N --lat N --lng N --radio N]',
    );
    process.exit(1);
  }

  const criterios: CriteriosPortal = {
    tipo: 'local',
    zonaTexto: zona,
    comunidad: null,
    provincia: zona,
    municipio: null,
    latitud: leerOpcion(args, 'lat'),
    longitud: leerOpcion(args, 'lng'),
    radioKm: leerOpcion(args, 'radio'),
    precioMin: leerOpcion(args, 'min'),
    precioMax: leerOpcion(args, 'max'),
    superficieMin: leerOpcion(args, 'sup'),
    superficieMax: null,
    pieCalle: null,
    facturacionMin: null,
    facturacionMax: null,
  };

  let objetivos: string[];
  if (objetivo === 'todos') objetivos = [...Object.keys(PROVIDERS_LOCAL), ...Object.keys(PROVIDERS_FARMACIA)];
  else if (objetivo === 'locales') objetivos = Object.keys(PROVIDERS_LOCAL);
  else if (objetivo === 'farmacias') objetivos = Object.keys(PROVIDERS_FARMACIA);
  else if (getProvider(objetivo)) objetivos = [objetivo];
  else {
    console.error(
      `Portal desconocido: "${objetivo}". Opciones: ` +
        `${[...Object.keys(PROVIDERS_LOCAL), ...Object.keys(PROVIDERS_FARMACIA)].join(', ')}, locales, farmacias, todos`,
    );
    process.exit(1);
    return;
  }

  for (const portalId of objetivos) await probar(portalId, criterios);
  console.log('');
}

void main();
