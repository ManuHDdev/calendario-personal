import { useEffect, useId, useRef, useState } from 'react';
import AutocompleteInput from './AutocompleteInput';
import { opcionExacta } from '../lib/autocomplete';

export type FiltroTipo = 'todos' | 'gasto' | 'ganancia';

interface Props {
  tipo: FiltroTipo;
  onTipoChange: (tipo: FiltroTipo) => void;
  /** Applied category filter ('' = all). */
  categoria: string;
  categoriasDisponibles: string[];
  onCategoriaChange: (categoria: string) => void;
  busqueda: string;
  onBusquedaChange: (texto: string) => void;
  hayFiltros: boolean;
  onLimpiar: () => void;
}

const OPCIONES_TIPO: { valor: FiltroTipo; texto: string }[] = [
  { valor: 'todos', texto: 'Todo' },
  { valor: 'gasto', texto: 'Gastos' },
  { valor: 'ganancia', texto: 'Ganancias' },
];

/** Type segmented control, category autocomplete and free-text search. */
export default function Filters({
  tipo, onTipoChange, categoria, categoriasDisponibles, onCategoriaChange, busqueda, onBusquedaChange, hayFiltros, onLimpiar,
}: Props) {
  const uid = useId();
  // The category filter is exact on the server, so it only applies once the text
  // matches a known category (picked from the list or typed in full).
  const [borrador, setBorrador] = useState(categoria);
  const limpiadoAlEscribir = useRef(false);
  useEffect(() => {
    // Keep what the person is typing when the filter was cleared by that very typing.
    if (categoria === '' && limpiadoAlEscribir.current) limpiadoAlEscribir.current = false;
    else setBorrador(categoria);
  }, [categoria]);

  const cambiarBorrador = (texto: string) => {
    setBorrador(texto);
    const exacta = opcionExacta(categoriasDisponibles, texto);
    if (exacta) {
      if (exacta !== categoria) onCategoriaChange(exacta);
    } else if (categoria) {
      limpiadoAlEscribir.current = true;
      onCategoriaChange('');
    }
  };

  return (
    <section className="filters" aria-label="Filtros">
      <div className="segmented" role="radiogroup" aria-label="Mostrar">
        {OPCIONES_TIPO.map((o) => (
          <label key={o.valor} className={`segmented-option${tipo === o.valor ? ' segmented-option--on' : ''}`}>
            <input
              type="radio"
              name={`${uid}-tipo`}
              value={o.valor}
              checked={tipo === o.valor}
              onChange={() => onTipoChange(o.valor)}
            />
            {o.texto}
          </label>
        ))}
      </div>

      <div className="filters-row">
        <AutocompleteInput
          label="Categoría"
          hideLabel
          placeholder="Todas las categorías"
          value={borrador}
          onChange={cambiarBorrador}
          onSelect={(v) => onCategoriaChange(v)}
          options={categoriasDisponibles}
          clearable
        />
        <div className="field">
          <label className="sr-only" htmlFor={`${uid}-buscar`}>Buscar</label>
          <input
            id={`${uid}-buscar`}
            className="input"
            type="search"
            autoComplete="off"
            placeholder="Comercio, nota o categoría"
            value={busqueda}
            onChange={(e) => onBusquedaChange(e.target.value)}
          />
        </div>
      </div>

      {hayFiltros && (
        <button type="button" className="link-btn" onClick={onLimpiar}>Quitar filtros</button>
      )}
    </section>
  );
}
