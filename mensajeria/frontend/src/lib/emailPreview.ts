// Construcción del documento que se muestra dentro del <iframe sandbox> del
// visor de correos (EmailHtmlPreview). El HTML de un correo capturado NO es de
// confianza: lo escribe quien envía el correo (incluido el SMTP falso, que
// acepta sesiones sin autenticar, y los servicios externos cuyos OTP se
// prueban). La seguridad real la da el atributo `sandbox` del iframe, que
// desactiva scripts y aísla el origen; esta función solo envuelve el cuerpo en
// un documento mínimo y legible.

/**
 * Envuelve el HTML (no confiable) de un correo en un documento completo apto
 * para el `srcdoc` de un iframe aislado. No sanea ni intenta neutralizar el
 * contenido: eso es responsabilidad del `sandbox` del iframe. Añade un
 * `<base target="_blank">` para que cualquier enlace que el usuario pulse se
 * abra fuera del iframe en una pestaña nueva, y un color de texto heredado del
 * tema para que el correo sea legible en claro y oscuro.
 */
export function buildEmailSrcdoc(html: string, textColor = '#1d1d1f'): string {
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<base target="_blank">',
    `<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:${textColor};word-break:break-word;}img{max-width:100%;height:auto;}</style>`,
    '</head>',
    `<body>${html}</body>`,
    '</html>',
  ].join('');
}

/**
 * Valor del atributo `sandbox` del iframe del visor. Cadena vacía = todas las
 * restricciones activas: sin scripts, sin acceso al mismo origen, sin envío de
 * formularios, sin popups. Expuesto como constante para que el test afirme que
 * NUNCA incluye `allow-scripts` ni `allow-same-origin` (la combinación de
 * ambos anularía el aislamiento).
 */
export const EMAIL_IFRAME_SANDBOX = '';
