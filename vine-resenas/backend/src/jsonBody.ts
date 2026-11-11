import type { FastifyInstance } from 'fastify';

/**
 * Por defecto Fastify responde 400 (`FST_ERR_CTP_EMPTY_JSON_BODY`) a cualquier
 * petición con `Content-Type: application/json` y cuerpo vacío, aunque el
 * endpoint no espere cuerpo (p. ej. `POST /searches/:id/rastrear`). Un cliente
 * que declara la cabecera sin enviar body es un patrón habitual, así que aquí
 * un cuerpo vacío se trata como "sin cuerpo" (`undefined`) en lugar de error.
 * El JSON mal formado sigue devolviendo 400.
 */
export function registrarParserJsonToleranteAVacio(app: FastifyInstance): void {
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      const texto = (body as string).trim();
      if (texto === '') {
        done(null, undefined);
        return;
      }
      try {
        done(null, JSON.parse(texto));
      } catch (err) {
        (err as Error & { statusCode?: number }).statusCode = 400;
        done(err as Error, undefined);
      }
    },
  );
}
