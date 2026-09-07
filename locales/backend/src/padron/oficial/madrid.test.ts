import { describe, it, expect } from 'vitest';
import { parsearDatasetMadrid, ImportadorError } from './madrid';

// El CSV real no se pudo inspeccionar al programar (sin salida de red), así
// que estas fixtures cubren las FORMAS plausibles, no una copia del fichero.
// Si el importador falla contra el CSV de verdad, el arreglo es añadir alias.

const CON_COORDENADAS = `Codigo;Nombre;Direccion;Numero;Municipio;CodigoPostal;Latitud;Longitud
F001;Farmacia Sol;Calle Mayor;12;Madrid;28013;40,4169;-3,7035
F002;Farmacia Norte;Calle Bravo Murillo;200;Madrid;28020;40,4600;-3,7000`;

const SIN_COORDENADAS = `Codigo,Denominacion,Domicilio,Num,Localidad,CP
F010,Farmacia Getafe,Avenida de España,4,Getafe,28901`;

const SIN_NADA_UTIL = `columna_rara;otra_columna
1;2`;

describe('parsearDatasetMadrid', () => {
  it('lee un CSV con coordenadas y coma decimal española', () => {
    const r = parsearDatasetMadrid(CON_COORDENADAS);
    expect(r).toHaveLength(2);
    expect(r[0].fuenteId).toBe('F001');
    expect(r[0].nombre).toBe('Farmacia Sol');
    expect(r[0].direccion).toBe('Calle Mayor, 12');
    expect(r[0].lat).toBeCloseTo(40.4169);
    expect(r[0].lng).toBeCloseTo(-3.7035);
    expect(r[0].precision).toBe('exacta');
  });

  it('lee un CSV sin coordenadas y deja lista la consulta de geocodificación', () => {
    const r = parsearDatasetMadrid(SIN_COORDENADAS);
    expect(r[0].lat).toBeNull();
    expect(r[0].consultaGeocodificacion).toBe('Avenida de España, 4, 28901, Getafe, España');
    // Sigue siendo `exacta`: la dirección lleva número, y geocodificarla
    // apunta al portal concreto.
    expect(r[0].precision).toBe('exacta');
  });

  it('acepta los nombres de columna alternativos', () => {
    // "Denominacion" y "Domicilio" en vez de "Nombre" y "Direccion".
    const r = parsearDatasetMadrid(SIN_COORDENADAS);
    expect(r[0].nombre).toBe('Farmacia Getafe');
    expect(r[0].municipio).toBe('Getafe');
  });

  it('falla con la cabecera real cuando no reconoce nada, en vez de adivinar', () => {
    // Importar filas que no se pueden ubicar llenaría el padrón de basura e
    // inflaría la cobertura, que es justo lo que produce falsos verdes.
    expect(() => parsearDatasetMadrid(SIN_NADA_UTIL)).toThrow(ImportadorError);
    expect(() => parsearDatasetMadrid(SIN_NADA_UTIL)).toThrow(/columna_rara \| otra_columna/);
  });

  it('rechaza el (0,0) del Golfo de Guinea como coordenada válida', () => {
    const csv = `Codigo;Nombre;Direccion;Municipio;Latitud;Longitud
F003;Farmacia Fantasma;Calle X;Madrid;0;0`;
    expect(parsearDatasetMadrid(csv)[0].lat).toBeNull();
  });

  it('rechaza coordenadas fuera de rango', () => {
    const csv = `Codigo;Nombre;Direccion;Municipio;Latitud;Longitud
F004;Farmacia Rara;Calle Y;Madrid;999;-3,70`;
    expect(parsearDatasetMadrid(csv)[0].lat).toBeNull();
  });

  it('un CSV vacío falla en vez de importar cero en silencio', () => {
    expect(() => parsearDatasetMadrid('')).toThrow(ImportadorError);
  });

  it('sin código de registro compone un id estable con la dirección', () => {
    const csv = `Nombre;Direccion;Numero;Municipio
Farmacia Sin Id;Calle Luna;7;Madrid`;
    const r = parsearDatasetMadrid(csv);
    expect(r[0].fuenteId).toBe('Calle Luna, 7|Madrid');
    // Estable: reparsear el mismo CSV da el mismo id.
    expect(parsearDatasetMadrid(csv)[0].fuenteId).toBe(r[0].fuenteId);
  });
});
