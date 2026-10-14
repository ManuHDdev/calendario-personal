import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { sugerir } from '../lib/autocomplete';

interface Props {
  label: string;
  /** Keeps the label for screen readers only (the placeholder carries the meaning visually). */
  hideLabel?: boolean;
  value: string;
  onChange: (value: string) => void;
  /** Previously used values, most used first. Free text is always accepted. */
  options: string[];
  /** Called when the person picks a suggestion (click, tap or Enter). */
  onSelect?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  /** Shows a clear button while there is text. */
  clearable?: boolean;
  error?: string;
  inputRef?: (el: HTMLInputElement | null) => void;
  autoComplete?: string;
}

/**
 * Combobox (ARIA 1.2 list autocomplete) showing at most a handful of previously
 * used values. Replaces <datalist>, which cannot cap or rank its suggestions.
 */
export default function AutocompleteInput({
  label, hideLabel, value, onChange, options, onSelect, placeholder, required, clearable, error, inputRef, autoComplete,
}: Props) {
  const uid = useId();
  const inputId = `${uid}-input`;
  const listId = `${uid}-list`;
  const errorId = `${uid}-error`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const sugerencias = useMemo(() => sugerir(options, value), [options, value]);
  const visible = open && sugerencias.length > 0;
  const listRef = useRef<HTMLUListElement>(null);

  // Inside a scrolling dialog the list can open below the fold; bring it into view.
  useEffect(() => {
    if (visible) listRef.current?.scrollIntoView({ block: 'nearest' });
  }, [visible]);

  const pick = (opcion: string) => {
    onChange(opcion);
    onSelect?.(opcion);
    setOpen(false);
    setActive(-1);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!visible) {
          setOpen(true);
          setActive(0);
        } else {
          setActive((a) => (a + 1) % sugerencias.length);
        }
        break;
      case 'ArrowUp':
        if (visible) {
          e.preventDefault();
          setActive((a) => (a <= 0 ? sugerencias.length - 1 : a - 1));
        }
        break;
      case 'Enter':
        if (visible && active >= 0) {
          e.preventDefault();
          pick(sugerencias[active]);
        }
        break;
      case 'Escape':
        if (visible) {
          // Close the list only; the surrounding dialog must stay open.
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          setActive(-1);
        }
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
    }
  };

  return (
    <div className="field">
      <label className={hideLabel ? "sr-only" : "field-label"} htmlFor={inputId}>{label}</label>
      <div className="combo">
        <input
          id={inputId}
          ref={inputRef}
          className={`input${clearable ? ' input--clearable' : ''}`}
          type="text"
          role="combobox"
          aria-expanded={visible}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={visible && active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          autoComplete={autoComplete ?? 'off'}
          enterKeyHint="next"
          placeholder={placeholder}
          required={required}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => { setOpen(false); setActive(-1); }}
          onKeyDown={handleKeyDown}
        />
        {clearable && value && (
          <button
            type="button"
            className="combo-clear"
            aria-label={`Quitar ${label.toLowerCase()}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { onChange(''); onSelect?.(''); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        )}
        {visible && (
          <ul ref={listRef} id={listId} className="combo-list" role="listbox" aria-label={`Sugerencias de ${label.toLowerCase()}`}>
            {sugerencias.map((s, i) => (
              <li
                key={s}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`combo-option${i === active ? ' combo-option--active' : ''}`}
                // mousedown (not click) so the input keeps focus and blur does not close the list first
                onMouseDown={(e) => { e.preventDefault(); pick(s); }}
                onMouseEnter={() => setActive(i)}
              >
                {s}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p id={errorId} className="field-error">{error}</p>}
    </div>
  );
}
