import { Fragment } from 'react';
import './FolderBreadcrumb.css';

interface Props {
  activeFolder: string | null;
  rootOnly: boolean;
  /** Mismo callback que ya usa el sidebar: null = raíz, o una ruta de carpeta. */
  onNavigate: (folder: string | null) => void;
}

/**
 * Dónde estás, siempre a la vista y sin truncar.
 *
 * El título de la cabecera ya dice la carpeta actual, pero en móvil compite
 * por sitio con la búsqueda y el botón de subir, y acababa cortado con "...".
 * Esta barra va debajo, envuelve en vez de recortar, y cada tramo del camino
 * es pulsable para subir directamente a esa carpeta — no solo a la anterior.
 *
 * No se muestra en la raíz general ("Todos los archivos" sin filtrar): ahí el
 * título solo ya es inequívoco y una migaja de un único elemento no aporta
 * nada, solo ruido.
 */
export default function FolderBreadcrumb({ activeFolder, rootOnly, onNavigate }: Props) {
  if (activeFolder === null && !rootOnly) return null;

  const segments = activeFolder ? activeFolder.split('/') : [];

  return (
    <nav className="folder-breadcrumb" aria-label="Ubicación actual">
      <button type="button" className="breadcrumb-crumb" onClick={() => onNavigate(null)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="3" width="7" height="7" rx="1"/>
          <rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/>
          <rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
        Todos los archivos
      </button>

      {rootOnly && (
        <>
          <Separator />
          <span className="breadcrumb-crumb breadcrumb-current">
            <FolderIcon />
            Sin carpeta
          </span>
        </>
      )}

      {segments.map((segment, i) => {
        const path = segments.slice(0, i + 1).join('/');
        const isLast = i === segments.length - 1;
        return (
          <Fragment key={path}>
            <Separator />
            {isLast ? (
              <span className="breadcrumb-crumb breadcrumb-current" aria-current="location">
                <FolderIcon />
                {segment}
              </span>
            ) : (
              <button type="button" className="breadcrumb-crumb" onClick={() => onNavigate(path)}>
                {segment}
              </button>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

function Separator() {
  return (
    <svg className="breadcrumb-separator" width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polyline points="9 6 15 12 9 18"/>
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    </svg>
  );
}
