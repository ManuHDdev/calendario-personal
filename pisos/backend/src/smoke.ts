/**
 * Comprobación manual contra los portales REALES.
 *
 * Los tests unitarios de este backend corren contra HTML/JSON de ejemplo
 * guardado en el repo, así que verifican la LÓGICA de parseo pero no pueden
 * verificar que los portales sigan sirviendo hoy lo que se espera de ellos —
 * ni CI ni un entorno sin salida a internet pueden hacerlo. Este script es
 * ese eslabón: se ejecuta a mano, golpea el portal de verdad y enseña qué ha
 * entendido, para poder ajustar el bloque de conocimiento del provider
 * correspondiente si algo ha cambiado.
 *
 *   npm run smoke -- fotocasa "Badajoz"
 *   npm run smoke -- pisos "Madrid" --max 250000
 *   npm run smoke -- wallapop "Badajoz" --lat 38.8794 --lng -6.9707 --radio 30
 *   npm run smoke -- todos "Badajoz" --lat 38.8794 --lng -6.9707 --radio 30
 */

import { PROVIDERS } from './portales';
import { PORTALES, TIPOS, type PortalId, type TipoInmueble } from './types/pisos';
import type { CriteriosPortal } from './portales/types';

function leerOpcion(args: string[], nombre: string): number | null {
  const indice = args.indexOf(`--${nombre}`);
  if (indice === -1 || indice === args.length - 1) return null;
  const valor = Number(args[indice + 1]);
  return Number.isFinite(valor) ? valor : null;
}

function leerTexto(args: string[], nombre: string): string | null {
  const indice = args.indexOf(`--${nombre}`);
  if (indice === -1 || indice === args.length - 1) return null;
  return args[indice + 1] ?? null;
}

async function probar(portalId: PortalId, criterios: CriteriosPortal): Promise<void> {
  const provider = PROVIDERS[portalId];
  console.log(`\n══ ${provider.nombre} ${'═'.repeat(Math.max(0, 50 - provider.nombre.length))}`);

  const disponibilidad = provider.puedeBuscar(criterios);
  if (!disponibilidad.ok) {
    console.log(`  ⏭  omitido: ${disponibilidad.motivo}`);
    return;
  }

  const inicio = Date.now();
  try {
    const anuncios = await provider.buscar(criterios, { maxPaginas: 1 });
    console.log(`  ✅ ${anuncios.length} anuncio(s) en ${Date.now() - inicio} ms`);

    if (anuncios.length === 0) {
      console.log(
        '  ⚠️  Cero resultados. O la zona no tiene nada, o el portal ha cambiado su\n' +
          `     estructura: revisa el bloque de conocimiento en portales/${portalId}.ts`,
      );
      return;
    }

    // Cuántos anuncios traen cada dato: es la métrica que de verdad importa,
    // porque un parser medio roto devuelve anuncios con todo a null y aun así
    // "funciona".
    const cobertura = (campo: keyof (typeof anuncios)[number]) =>
      `${anuncios.filter((a) => a[campo] !== null).length}/${anuncios.length}`;
    // En `local` no se listan hab/baños: un local no los tiene, así que
    // omitirlos evita que la cobertura se lea como una avería del parser.
    const esLocal = criterios.tipo === 'local';
    console.log(
      `  📊 precio ${cobertura('precio')} · m² ${cobertura('metros')} · ` +
        (esLocal ? '' : `hab ${cobertura('habitaciones')} · baños ${cobertura('banos')} · `) +
        `imagen ${cobertura('imagenUrl')}`,
    );

    for (const a of anuncios.slice(0, 3)) {
      console.log(
        `\n  • ${a.titulo}\n` +
          `    ${a.precio ?? '?'} € · ${a.metros ?? '?'} m² · ${a.habitaciones ?? '?'} hab · ${a.banos ?? '?'} baños\n` +
          `    ${a.ubicacion ?? 'sin ubicación'}\n` +
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
  const ubicacion = args[1];

  if (!objetivo || !ubicacion) {
    console.error('Uso: npm run smoke -- <fotocasa|pisos|wallapop|todos> "<ubicación>" [--tipo vivienda|local] [--min N] [--max N] [--lat N --lng N --radio N]');
    process.exit(1);
  }

  const tipoBruto = leerTexto(args, 'tipo') ?? 'vivienda';
  if (!TIPOS.includes(tipoBruto as TipoInmueble)) {
    console.error(`Tipo desconocido: "${tipoBruto}". Opciones: ${TIPOS.join(', ')}`);
    process.exit(1);
  }
  const tipo = tipoBruto as TipoInmueble;

  const criterios: CriteriosPortal = {
    tipo,
    ubicacion,
    latitud: leerOpcion(args, 'lat'),
    longitud: leerOpcion(args, 'lng'),
    radioKm: leerOpcion(args, 'radio'),
    precioMin: leerOpcion(args, 'min'),
    precioMax: leerOpcion(args, 'max'),
    metrosMin: leerOpcion(args, 'metros'),
    metrosMax: null,
    habitacionesMin: leerOpcion(args, 'hab'),
    banosMin: null,
  };

  const objetivos: PortalId[] =
    objetivo === 'todos' ? [...PORTALES] : PORTALES.includes(objetivo as PortalId) ? [objetivo as PortalId] : [];

  if (objetivos.length === 0) {
    console.error(`Portal desconocido: "${objetivo}". Opciones: ${PORTALES.join(', ')}, todos`);
    process.exit(1);
  }

  for (const portalId of objetivos) await probar(portalId, criterios);
  console.log('');
}

void main();
