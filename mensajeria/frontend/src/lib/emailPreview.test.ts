import { describe, it, expect } from 'vitest';
import { buildEmailSrcdoc, EMAIL_IFRAME_SANDBOX } from './emailPreview';

describe('buildEmailSrcdoc', () => {
  it('envuelve el cuerpo del correo en un documento HTML completo', () => {
    const doc = buildEmailSrcdoc('<p>Hola</p>');
    expect(doc.startsWith('<!doctype html>')).toBe(true);
    expect(doc).toContain('<body><p>Hola</p></body>');
    expect(doc).toContain('<base target="_blank">');
  });

  it('inserta el HTML tal cual (el aislamiento lo da el sandbox, no esta función)', () => {
    // Esta función NO sanea a propósito: su único trabajo es el envoltorio.
    // La garantía de seguridad se verifica en EmailHtmlPreview.test.tsx.
    const payload = '<img src=x onerror="alert(1)">';
    expect(buildEmailSrcdoc(payload)).toContain(payload);
  });
});

describe('EMAIL_IFRAME_SANDBOX', () => {
  it('nunca habilita scripts ni acceso al mismo origen', () => {
    expect(EMAIL_IFRAME_SANDBOX).not.toContain('allow-scripts');
    expect(EMAIL_IFRAME_SANDBOX).not.toContain('allow-same-origin');
  });
});
