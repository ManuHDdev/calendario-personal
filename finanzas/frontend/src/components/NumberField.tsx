import './NumberField.css';

interface NumberFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
  placeholder?: string;
  step?: string;
  min?: number;
  required?: boolean;
}

// Input numérico controlado y reutilizable para todas las calculadoras.
// Se maneja como string en el estado del formulario (permite dejar el campo
// vacío mientras se escribe) y cada calculadora hace el parseo/validación
// numérica al enviar.
export default function NumberField({
  label,
  value,
  onChange,
  suffix,
  placeholder,
  step = 'any',
  min = 0,
  required = true,
}: NumberFieldProps) {
  return (
    <label className="number-field">
      <span className="number-field-label">{label}</span>
      <div className="number-field-input-wrap">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          required={required}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && <span className="number-field-suffix">{suffix}</span>}
      </div>
    </label>
  );
}
