/**
 * Smoke contra el feed REAL de la DGT:  npm run smoke [-- --imagenes]
 *
 * Los tests de vitest corren contra fixtures sintéticos, así que NO pueden
 * demostrar que el feed siga teniendo la forma que el parser espera (CI no sale
 * a internet). Este script sí: descarga el feed, lo parsea y enseña la
 * cobertura por campo y por ciudad. Con `--imagenes` comprueba además que las
 * primeras cámaras cercanas sirvan de verdad un JPEG.
 *
 * Ejecutarlo tras cada despliegue y cuando el importador deje de traer cámaras.
 */
import { descargarFeed, urlFeed } from './services/importador';
import { parsearFeedDgt } from './services/dgtParser';
import { filtrarCercanas, resumirCobertura } from './services/cobertura';
import { CIUDADES } from './services/ciudades';
import { crearCapturadorHttp } from './services/imagenProxy';

async function main(): Promise<void> {
  const conImagenes = process.argv.includes('--imagenes');
  const url = urlFeed();
  console.log(`Feed: ${url}`);

  const xml = await descargarFeed(url);
  console.log(`Descargado: ${(xml.length / 1024).toFixed(0)} KB`);

  const feed = parsearFeedDgt(xml);
  const r = resumirCobertura(feed);
  console.log(`\nCámaras reconocidas en el feed: ${r.totalFeed}`);
  console.log(`Dentro de las ciudades:          ${r.totalCercanas}`);
  for (const c of CIUDADES) console.log(`  ${c.nombre.padEnd(26)} ${r.porCiudad[c.slug]}`);
  console.log(`\nCobertura de campos (sobre las cercanas):`);
  console.log(`  con carretera:        ${r.conCarretera}/${r.totalCercanas}`);
  console.log(`  sin nombre descriptivo: ${r.sinNombreReal}/${r.totalCercanas}`);

  if (r.totalFeed === 0) {
    console.error('\n❌ 0 cámaras: el parser no reconoce el formato. Guarda el XML y ajusta services/dgtParser.ts.');
    process.exitCode = 1;
    return;
  }
  if (r.totalCercanas === 0) {
    console.error('\n❌ El feed trae cámaras pero ninguna cae en las ciudades (¿coordenadas intercambiadas?).');
    process.exitCode = 1;
    return;
  }

  const muestra = filtrarCercanas(feed).slice(0, 5);
  console.log('\nMuestra:');
  for (const m of muestra) {
    console.log(`  [${m.ciudad}] ${m.camara.nombre} (${m.distanciaKm.toFixed(1)} km) ${m.camara.urlImagen}`);
  }

  if (conImagenes) {
    const capturar = crearCapturadorHttp();
    let vivas = 0;
    const cercanas = filtrarCercanas(feed).slice(0, 10);
    for (const m of cercanas) {
      try {
        const img = await capturar(m.camara.urlImagen);
        vivas++;
        console.log(`  ✓ ${m.camara.nombre}: ${img.tipo} ${(img.cuerpo.length / 1024).toFixed(0)} KB`);
      } catch (err) {
        console.log(`  ✗ ${m.camara.nombre}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    console.log(`\nImágenes vivas: ${vivas}/${cercanas.length}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
