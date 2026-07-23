import { TestBed } from '@angular/core/testing';
import { SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { LinkifyPipe } from './linkify.pipe';

describe('LinkifyPipe', () => {
  let pipe: LinkifyPipe;
  let sanitizer: DomSanitizer;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    sanitizer = TestBed.inject(DomSanitizer);
    pipe = new LinkifyPipe(sanitizer);
  });

  function render(value: string | null): string {
    return sanitizer.sanitize(SecurityContext.HTML, pipe.transform(value)) ?? '';
  }

  it('convierte una URL en un enlace clicable que abre en pestaña nueva', () => {
    const html = render('Visita https://example.com para más info');
    expect(html).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a>'
    );
  });

  it('reconoce URLs con prefijo www. sin protocolo y añade https:// al href', () => {
    const html = render('Mira www.example.com');
    expect(html).toContain(
      '<a href="https://www.example.com" target="_blank" rel="noopener noreferrer">www.example.com</a>'
    );
  });

  it('excluye la puntuación final del enlace (punto, coma, paréntesis)', () => {
    const html = render('Página oficial: https://example.com.');
    expect(html).toContain('>https://example.com</a>.');
  });

  it('texto sin URL se muestra igual, sin enlaces', () => {
    const html = render('Sin ningún enlace aquí');
    expect(html).toBe('Sin ningún enlace aquí');
    expect(html).not.toContain('<a ');
  });

  it('escapa HTML/script en vez de ejecutarlo', () => {
    const html = render('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('valor vacío o nulo no produce error', () => {
    expect(render(null)).toBe('');
  });
});
