import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import EmailHtmlPreview from './EmailHtmlPreview';

// Regresión del XSS almacenado del inbox (auditoría 2026-10-04): el cuerpo HTML
// de un correo capturado no es de confianza y antes se inyectaba con
// `dangerouslySetInnerHTML`. Ahora se muestra en un iframe aislado.

describe('EmailHtmlPreview', () => {
  it('renderiza un iframe con sandbox restrictivo, no un div inyectado', () => {
    const out = renderToStaticMarkup(<EmailHtmlPreview html="<p>hola</p>" />);
    expect(out).toContain('<iframe');
    // sandbox presente y vacío = todas las restricciones activas.
    expect(out).toMatch(/sandbox=""/);
    expect(out).not.toContain('allow-scripts');
    expect(out).not.toContain('allow-same-origin');
    // El contenido viaja por srcdoc (atributo), no como DOM vivo del documento.
    expect(out.toLowerCase()).toContain('srcdoc=');
  });

  it('un payload XSS queda codificado dentro del atributo srcdoc, nunca como nodo vivo', () => {
    const payload = '<img src=x onerror="alert(document.cookie)">';
    const out = renderToStaticMarkup(<EmailHtmlPreview html={payload} />);
    // React codifica el valor del atributo: las comillas y signos se escapan,
    // así que NO aparece un atributo `onerror=` ejecutable en el documento
    // padre, ni una etiqueta <img> viva fuera del iframe.
    expect(out).not.toContain('onerror="alert');
    expect(out).toContain('onerror=&quot;alert');
    // Sigue siendo el único <img ...> ausente como nodo del padre: lo único
    // que hay es el propio iframe.
    expect(out.indexOf('<img')).toBe(-1);
  });
});
