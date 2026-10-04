import { buildEmailSrcdoc, EMAIL_IFRAME_SANDBOX } from '../lib/emailPreview';

interface Props {
  html: string;
}

/**
 * Muestra el cuerpo HTML (no confiable) de un correo capturado dentro de un
 * iframe aislado (`sandbox`), en vez de inyectarlo en el DOM de la app con
 * `dangerouslySetInnerHTML`. El sandbox desactiva scripts y aísla el origen,
 * así que un correo con `<script>` o `<img onerror=...>` no puede ejecutar
 * nada en el contexto de la aplicación ni leer la sesión de Keycloak del
 * usuario. Componente presentacional puro (solo props) para poder testearlo
 * sin estado ni efectos.
 */
export default function EmailHtmlPreview({ html }: Props) {
  return (
    <iframe
      className="inbox-detail-html"
      title="Contenido del email"
      sandbox={EMAIL_IFRAME_SANDBOX}
      srcDoc={buildEmailSrcdoc(html)}
    />
  );
}
