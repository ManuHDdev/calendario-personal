import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import Dialog from './Dialog';
import AutocompleteInput from './AutocompleteInput';
import { getCategorias, getComercios } from '../services/api';
import { hoyLocal, importeParaInput, parseImporte } from '../lib/formato';
import type { Gasto, MovimientoValores, Tipo } from '../types';

interface Props {
  /** Movement being edited; omit to add a new one. */
  gasto?: Gasto;
  /** Type preselected when adding. */
  tipoInicial?: Tipo;
  onClose: () => void;
  /** Persists the values; a thrown error is shown inside the dialog. */
  onSave: (valores: MovimientoValores) => Promise<void>;
}

type Campo = 'importe' | 'fecha' | 'comercio';
type Errores = Partial<Record<Campo, string>>;

const COPY: Record<Tipo, { comercio: string; comercioPlaceholder: string; vacio: string }> = {
  gasto: { comercio: 'Comercio', comercioPlaceholder: 'Por ejemplo, Mercadona', vacio: 'Indica en qué comercio ha sido.' },
  ganancia: { comercio: '¿De dónde viene?', comercioPlaceholder: 'Por ejemplo, Nómina', vacio: 'Indica de dónde viene el dinero.' },
};

/** One dialog for adding and editing a movement (expense or income, confirmed or forecast). */
export default function MovementDialog({ gasto, tipoInicial = 'gasto', onClose, onSave }: Props) {
  const editando = !!gasto;
  const formId = useId();
  const esPrevisionExistente = gasto?.estado === 'previsto';

  const [tipo, setTipo] = useState<Tipo>(gasto?.tipo ?? tipoInicial);
  const [importe, setImporte] = useState(gasto ? importeParaInput(gasto.importe) : '');
  const [fecha, setFecha] = useState(gasto?.fecha ? gasto.fecha.slice(0, 10) : editando ? '' : hoyLocal());
  const [comercio, setComercio] = useState(gasto?.comercio ?? '');
  const [categoria, setCategoria] = useState(gasto?.categoria ?? '');
  const [concepto, setConcepto] = useState(gasto?.concepto ?? '');
  const [previsto, setPrevisto] = useState(esPrevisionExistente);
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState('');
  const [guardando, setGuardando] = useState(false);

  const [comercios, setComercios] = useState<string[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const cacheSugerencias = useRef<Partial<Record<Tipo, { comercios: string[]; categorias: string[] }>>>({});

  const importeRef = useRef<HTMLInputElement>(null);
  const fechaRef = useRef<HTMLInputElement>(null);
  const comercioRef = useRef<HTMLInputElement | null>(null);

  // Suggestions follow the type so "Nómina" is not offered while adding a supermarket expense.
  useEffect(() => {
    let vigente = true;
    const cache = cacheSugerencias.current[tipo];
    if (cache) {
      setComercios(cache.comercios);
      setCategorias(cache.categorias);
      return;
    }
    Promise.all([getComercios(tipo), getCategorias(tipo)])
      .then(([c, k]) => {
        cacheSugerencias.current[tipo] = { comercios: c, categorias: k };
        if (vigente) {
          setComercios(c);
          setCategorias(k);
        }
      })
      .catch(() => { /* suggestions are best-effort; typing still works */ });
    return () => { vigente = false; };
  }, [tipo]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const valorImporte = parseImporte(importe);
    const nuevos: Errores = {};
    if (valorImporte === null || valorImporte <= 0) nuevos.importe = 'Escribe un importe mayor que 0, por ejemplo 12,50.';
    if (!previsto && !fecha) nuevos.fecha = 'Elige el día en que ocurrió.';
    if (!comercio.trim()) nuevos.comercio = COPY[tipo].vacio;
    setErrores(nuevos);
    setErrorGeneral('');

    if (nuevos.importe) { importeRef.current?.focus(); return; }
    if (nuevos.fecha) { fechaRef.current?.focus(); return; }
    if (nuevos.comercio) { comercioRef.current?.focus(); return; }

    setGuardando(true);
    try {
      await onSave({
        tipo,
        importe: valorImporte as number,
        fecha: fecha || null,
        comercio: comercio.trim(),
        categoria: categoria.trim(),
        concepto: concepto.trim(),
        previsto,
      });
    } catch (err) {
      setErrorGeneral(err instanceof Error ? err.message : 'No hemos podido guardarlo. Inténtalo de nuevo.');
      setGuardando(false);
    }
  };

  const titulo = editando
    ? (esPrevisionExistente ? 'Editar previsión' : tipo === 'ganancia' ? 'Editar ganancia' : 'Editar gasto')
    : 'Añadir movimiento';
  const textoGuardar = guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Guardar';
  // A confirmed movement stays confirmed; only new ones and forecasts can be (un)marked as forecast.
  const puedeSerPrevision = !editando || esPrevisionExistente;

  return (
    <Dialog
      title={titulo}
      onClose={onClose}
      dismissible={!guardando}
      initialFocus={editando ? undefined : '.amount-input'}
      footer={(
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button type="submit" form={formId} className="btn btn--primary" disabled={guardando}>{textoGuardar}</button>
        </>
      )}
    >
      <form id={formId} className="movement-form" onSubmit={handleSubmit} noValidate>
        <div className="type-toggle" role="radiogroup" aria-label="Tipo de movimiento">
          {(['gasto', 'ganancia'] as const).map((t) => (
            <label key={t} className={`type-option type-option--${t}${tipo === t ? ' type-option--on' : ''}`}>
              <input
                type="radio"
                name={`${formId}-tipo`}
                value={t}
                checked={tipo === t}
                onChange={() => setTipo(t)}
              />
              <span className="type-option-sign" aria-hidden="true">{t === 'gasto' ? '−' : '+'}</span>
              {t === 'gasto' ? 'Gasto' : 'Ganancia'}
            </label>
          ))}
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${formId}-importe`}>Importe</label>
          <div className="amount-wrap">
            <input
              id={`${formId}-importe`}
              ref={importeRef}
              className={`input amount-input amount-input--${tipo}`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              value={importe}
              aria-invalid={errores.importe ? true : undefined}
              aria-describedby={errores.importe ? `${formId}-importe-error` : undefined}
              onChange={(e) => setImporte(e.target.value)}
            />
            <span className="amount-unit" aria-hidden="true">€</span>
          </div>
          {errores.importe && <p id={`${formId}-importe-error`} className="field-error">{errores.importe}</p>}
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${formId}-fecha`}>
            {previsto ? 'Fecha prevista (si la sabes)' : 'Fecha'}
          </label>
          <input
            id={`${formId}-fecha`}
            ref={fechaRef}
            className="input"
            type="date"
            value={fecha}
            aria-invalid={errores.fecha ? true : undefined}
            aria-describedby={errores.fecha ? `${formId}-fecha-error` : undefined}
            onChange={(e) => setFecha(e.target.value)}
          />
          {errores.fecha && <p id={`${formId}-fecha-error`} className="field-error">{errores.fecha}</p>}
        </div>

        {puedeSerPrevision && (
          <label className="switch-row">
            <input
              type="checkbox"
              role="switch"
              className="switch-input"
              checked={previsto}
              onChange={(e) => setPrevisto(e.target.checked)}
            />
            <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
            <span className="switch-text">
              <span className="switch-title">Todavía no ha pasado</span>
              <span className="switch-hint">
                Se guarda como previsión y no cuenta en tus totales hasta que ocurra.
              </span>
            </span>
          </label>
        )}

        <AutocompleteInput
          label={COPY[tipo].comercio}
          placeholder={COPY[tipo].comercioPlaceholder}
          value={comercio}
          onChange={setComercio}
          options={comercios}
          error={errores.comercio}
          inputRef={(el) => { comercioRef.current = el; }}
        />

        <AutocompleteInput
          label="Categoría (opcional)"
          placeholder={tipo === 'gasto' ? 'Por ejemplo, Comida' : 'Por ejemplo, Trabajo'}
          value={categoria}
          onChange={setCategoria}
          options={categorias}
        />

        <div className="field">
          <label className="field-label" htmlFor={`${formId}-concepto`}>Nota (opcional)</label>
          <input
            id={`${formId}-concepto`}
            className="input"
            type="text"
            maxLength={500}
            autoComplete="off"
            placeholder="Algo que te ayude a recordarlo"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
          />
        </div>

        {errorGeneral && <p className="form-alert" role="alert">{errorGeneral}</p>}
      </form>
    </Dialog>
  );
}
