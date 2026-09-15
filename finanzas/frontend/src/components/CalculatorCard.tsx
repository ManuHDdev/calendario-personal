import type { ReactNode, FormEvent } from 'react';
import './CalculatorCard.css';

interface CalculatorCardProps {
  titulo: string;
  descripcion?: string;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  children: ReactNode; // campos del formulario (NumberField, selects, etc.)
  error?: string | null;
  resultado?: ReactNode;
}

// Contenedor genérico container/presentational para las 7 calculadoras: cada
// una aporta solo sus campos y su lógica de cálculo (container), y este
// componente se encarga de la presentación común (tarjeta, formulario,
// botón, hueco de error/resultado) para no duplicarla siete veces.
export default function CalculatorCard({
  titulo,
  descripcion,
  onSubmit,
  children,
  error,
  resultado,
}: CalculatorCardProps) {
  return (
    <div className="calculator-card">
      <h2 className="calculator-card-titulo">{titulo}</h2>
      {descripcion && <p className="calculator-card-descripcion">{descripcion}</p>}

      <form className="calculator-card-form" onSubmit={onSubmit}>
        <div className="calculator-card-campos">{children}</div>
        <button type="submit" className="calculator-card-boton">
          Calcular
        </button>
      </form>

      {error && <p className="calculator-card-error">{error}</p>}
      {resultado && <div className="calculator-card-resultado">{resultado}</div>}
    </div>
  );
}
