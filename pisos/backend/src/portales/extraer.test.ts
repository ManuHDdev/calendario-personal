import { describe, it, expect } from 'vitest';
import {
  extraerJsonLd,
  filtrarPorTipo,
  extraerEstadoEmbebido,
  buscarNodos,
  leerRuta,
  primerValor,
  comoEntero,
  comoBooleano,
} from './extraer';

describe('extraerJsonLd', () => {
  it('lee varios bloques y aplana @graph e itemListElement', () => {
    const html = `
      <html><head>
      <script type="application/ld+json">
        {"@graph":[{"@type":"Organization","name":"Portal"},{"@type":"Product","name":"Piso A"}]}
      </script>
      <script type="application/ld+json">
        {"@type":"ItemList","itemListElement":[
          {"@type":"ListItem","item":{"@type":"Residence","name":"Piso B"}}
        ]}
      </script>
      </head><body></body></html>`;

    const nombres = extraerJsonLd(html).map((o) => o.name).filter(Boolean);
    expect(nombres).toContain('Piso A');
    expect(nombres).toContain('Piso B');
  });

  it('ignora un bloque con JSON roto sin llevarse por delante los demás', () => {
    // Un solo script mal formado no puede tirar el parseo de la página
    // entera: sería perder todos los anuncios por culpa de uno.
    const html = `
      <script type="application/ld+json">{ esto no es json }</script>
      <script type="application/ld+json">{"@type":"Product","name":"Piso válido"}</script>`;
    expect(extraerJsonLd(html).map((o) => o.name)).toContain('Piso válido');
  });

  it('devuelve lista vacía si la página no trae JSON-LD', () => {
    expect(extraerJsonLd('<html><body>nada</body></html>')).toEqual([]);
  });
});

describe('filtrarPorTipo', () => {
  it('acepta @type como string o como array, sin distinguir mayúsculas', () => {
    const objetos = [
      { '@type': 'Product', name: 'a' },
      { '@type': ['Residence', 'Place'], name: 'b' },
      { '@type': 'Organization', name: 'c' },
    ];
    const nombres = filtrarPorTipo(objetos, ['product', 'residence']).map((o) => o.name);
    expect(nombres).toEqual(['a', 'b']);
  });
});

describe('extraerEstadoEmbebido', () => {
  it('lee el bloque __NEXT_DATA__ por su id', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">{"props":{"total":3}}</script>`;
    expect(leerRuta(extraerEstadoEmbebido(html), 'props.total')).toBe(3);
  });

  it('lee un estado asignado a una variable global', () => {
    const html = `<script>window.__INITIAL_STATE__ = {"resultados":{"n":7}};</script>`;
    expect(leerRuta(extraerEstadoEmbebido(html), 'resultados.n')).toBe(7);
  });

  it('devuelve null si no hay estado embebido reconocible', () => {
    expect(extraerEstadoEmbebido('<html><body>vacío</body></html>')).toBeNull();
  });

  it('recorta una variable global con objeto anidado (no corta en la primera })', () => {
    const html = `<script>window.__INITIAL_PROPS__ = {"a":{"b":{"c":42}},"d":1};</script>`;
    expect(leerRuta(extraerEstadoEmbebido(html), 'a.b.c')).toBe(42);
  });

  it('lee un <script type="application/json" id="…"> (Fotocasa: __initial_props__)', () => {
    const html = `<script type="application/json" id="__initial_props__">{"realEstates":[{"id":1}]}</script>`;
    expect(leerRuta(extraerEstadoEmbebido(html), 'realEstates.0.id')).toBe(1);
  });

  it('entre varios candidatos devuelve el mayor (el estado de hidratación)', () => {
    const html = `
      <script type="application/json">{"x":1}</script>
      <script>window.__NEXT_DATA__ = {"props":{"lista":[1,2,3,4,5,6,7,8,9,10]}};</script>`;
    expect(leerRuta(extraerEstadoEmbebido(html), 'props.lista.0')).toBe(1);
  });
});

describe('buscarNodos', () => {
  const esAnuncio = (n: Record<string, unknown>) => n.id !== undefined && n.price !== undefined;

  it('encuentra anuncios sin conocer la ruta exacta dentro del estado', () => {
    // Es justo la razón de ser de esta función: los portales renombran la
    // ruta de su estado con cada despliegue, pero la forma del anuncio no.
    const estado = {
      props: { pageProps: { seo: {}, data: { results: [{ id: 1, price: 100 }, { id: 2, price: 200 }] } } },
    };
    expect(buscarNodos(estado, esAnuncio).map((n) => n.id)).toEqual([1, 2]);
  });

  it('no desciende dentro de un anuncio ya reconocido', () => {
    // Si bajase, el objeto `seller` anidado podría contar como un segundo
    // anuncio y duplicar la fila.
    const estado = { items: [{ id: 1, price: 100, seller: { id: 99, price: 5 } }] };
    expect(buscarNodos(estado, esAnuncio)).toHaveLength(1);
  });

  it('sobrevive a una estructura con referencias circulares', () => {
    const nodo: Record<string, unknown> = { id: 1, price: 100 };
    const raiz: Record<string, unknown> = { hijos: [nodo] };
    nodo.padre = raiz;
    expect(buscarNodos(raiz, esAnuncio)).toHaveLength(1);
  });
});

describe('lectores tolerantes', () => {
  it('leerRuta no revienta con un tramo ausente', () => {
    expect(leerRuta({ a: { b: 1 } }, 'a.b')).toBe(1);
    expect(leerRuta({ a: null }, 'a.b.c')).toBeUndefined();
    expect(leerRuta(undefined, 'a')).toBeUndefined();
  });

  it('primerValor devuelve la primera ruta con contenido', () => {
    const objeto = { titulo: '', nombre: 'Piso' };
    expect(primerValor(objeto, ['ausente', 'titulo', 'nombre'])).toBe('Piso');
  });

  it('comoEntero limpia el formato del portal', () => {
    expect(comoEntero('90 m²')).toBe(90);
    expect(comoEntero(89.6)).toBe(90);
    expect(comoEntero('sin dato')).toBeNull();
  });

  it('comoBooleano entiende los "sí/no" de un portal español', () => {
    expect(comoBooleano('sí')).toBe(true);
    expect(comoBooleano('no')).toBe(false);
    expect(comoBooleano(1)).toBe(true);
    expect(comoBooleano('quizá')).toBeNull();
  });
});
