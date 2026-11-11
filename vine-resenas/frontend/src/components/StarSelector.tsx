interface Props {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}

/** 1-5 stars; tapping the current value clears it. */
export default function StarSelector({ value, onChange, disabled }: Props) {
  return (
    <div className="stars" role="radiogroup" aria-label="Estrellas">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`}
          className={`star${value !== null && n <= value ? ' star--on' : ''}`}
          disabled={disabled}
          onClick={() => onChange(value === n ? null : n)}
        >
          {'★'}
        </button>
      ))}
    </div>
  );
}
