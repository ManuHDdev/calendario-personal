import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Red de seguridad ante errores de render inesperados. Sin esto, un error no
 * capturado en el árbol desmonta toda la app y deja una pantalla en blanco
 * (ver design.md / postmortem del bug de `importe` como string). React solo
 * soporta esto vía componentes de clase (no hay equivalente en hooks), y no
 * sustituye arreglar la causa raíz — solo evita que un fallo futuro deje al
 * usuario sin ninguna pista de qué pasó.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Error no controlado en Reparto:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-fallback">
          <p>Ha ocurrido un error inesperado. Prueba a recargar la página.</p>
          <button onClick={() => window.location.reload()}>Recargar</button>
        </div>
      );
    }

    return this.props.children;
  }
}
