/**
 * Importador del padrón desde la línea de comandos.
 *
 *   npm run padron -- madrid
 *   npm run padron -- madrid andalucia valenciana
 *   npm run padron -- todas
 *   npm run padron -- --cobertura        (solo recalcular cobertura)
 *
 * Se ejecuta a mano la primera vez y luego lo llamará el planificador una vez
 * por semana. Va por comunidad porque Overpass responde mucho mejor a
 * consultas acotadas que a una de España entera, y porque así un fallo en una
 * comunidad no se lleva por delante el resto.
 */

import { pool } from '../db/pool';
import { importarComunidad, recalcularCobertura } from './importar';
import { ISO_POR_COMUNIDAD } from './osm';

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a.trim().length > 0);

  if (args.length === 0 || args.includes('--ayuda') || args.includes('-h')) {
    console.log('Uso: npm run padron -- <comunidad...|todas|--cobertura>');
    console.log(`Comunidades: ${Object.keys(ISO_POR_COMUNIDAD).join(', ')}`);
    await pool.end();
    return;
  }

  if (args.includes('--cobertura')) {
    console.log('Recalculando cobertura…');
    console.log(JSON.stringify(await recalcularCobertura(), null, 2));
    await pool.end();
    return;
  }

  const comunidades = args.includes('todas') ? Object.keys(ISO_POR_COMUNIDAD) : args;

  const desconocidas = comunidades.filter((c) => !ISO_POR_COMUNIDAD[c]);
  if (desconocidas.length > 0) {
    console.error(`Comunidades desconocidas: ${desconocidas.join(', ')}`);
    console.error(`Válidas: ${Object.keys(ISO_POR_COMUNIDAD).join(', ')}`);
    await pool.end();
    process.exitCode = 1;
    return;
  }

  let conErrores = 0;
  for (const comunidad of comunidades) {
    console.log(`\n=== ${comunidad} ===`);
    try {
      const r = await importarComunidad(comunidad);
      console.log(
        `  farmacias: ${r.farmaciasImportadas} · centros: ${r.centrosImportados} · ` +
          `poblaciones: ${r.poblacionesImportadas} · duplicados fusionados: ${r.duplicadosFusionados}`,
      );
      console.log(
        `  municipios evaluados: ${r.municipiosEvaluados} · con padrón incompleto: ${r.municipiosIncompletos}`,
      );
      if (r.errores.length > 0) {
        conErrores++;
        // Un import parcial nunca debe parecerse a uno completo.
        for (const e of r.errores) console.error(`  ⚠️  ${e}`);
      }
    } catch (err) {
      conErrores++;
      console.error(`  ❌ ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (conErrores > 0) {
    console.error(
      `\n${conErrores} comunidad(es) con incidencias. El padrón puede estar incompleto: ` +
        'revisa antes de fiarte de un veredicto verde.',
    );
    process.exitCode = 1;
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
