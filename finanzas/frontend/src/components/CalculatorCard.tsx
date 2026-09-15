import type { ReactNode, FormEvent } from 'react';
import './CalculatorCard.css';

interface CalculatorCardProps {
  titulo: string;
  descripcion?: string;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  children: ReactNode; // campos del formulario (NumberField, selects, etc.)
  error?: string | null;
  resultado?: ReactNode;
  // 'amplio' es para las calculadoras con tabla año a año (Interés compuesto
  // avanzado, proyección de alquiler): a 560px esa tabla no cabe y obliga a
  // hacer scroll horizontal. El resto se queda en el ancho normal.
  ancho?: 'normal' | 'amplio';
}

// Contenedor genérico container/presentational para las calculadoras: cada
// una aporta solo sus campos y su lógica de cálculo (container), y este
// componente se encarga de la presentación común (tarjeta, formulario,
// botón, hueco de error/resultado) para no duplicarla en cada una.
export default function CalculatorCard({
  titulo,
  descripcion,
  onSubmit,
  children,
  error,
  resultado,
  ancho = 'normal',
}: CalculatorCardProps) {
  return (
    <div className={`calculator-card${ancho === 'amplio' ? ' calculator-card--amplio' : ''}`}>
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
