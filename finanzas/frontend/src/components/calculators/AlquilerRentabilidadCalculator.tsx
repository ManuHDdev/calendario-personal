import { useState, type FormEvent } from 'react';
import CalculatorCard from '../CalculatorCard';
import NumberField from '../NumberField';
import {
  calcularAlquilerRentabilidad,
  type AlquilerRentabilidadResultado,
} from '../../lib/calculators';
import { formatEUR } from '../../lib/format';

const CLASE_VEREDICTO: Record<AlquilerRentabilidadResultado['veredicto'], string> = {
  'Merece la pena': 'buena',
  Dudoso: 'dudosa',
  'No merece la pena': 'mala',
};

export default function AlquilerRentabilidadCalculator() {
  const [precioVivienda, setPrecioVivienda] = useState('150000');
  const [entradaPct, setEntradaPct] = useState('20');
  const [gastosCompraPct, setGastosCompraPct] = useState('10');
  const [tinHipotecaPct, setTinHipotecaPct] = useState('3');
  const [plazoHipotecaAnios, setPlazoHipotecaAnios] = useState('25');
  const [alquilerMensual, setAlquilerMensual] = useState('750');
  const [ibiAnual, setIbiAnual] = useState('300');
  const [comunidadMensual, setComunidadMensual] = useState('40');
  const [seguroHogarAnual, setSeguroHogarAnual] = useState('150');
  const [mantenimientoPctAnual, setMantenimientoPctAnual] = useState('1');
  const [gestoriaPctAlquiler, setGestoriaPctAlquiler] = useState('0');
  const [tasaVacioPct, setTasaVacioPct] = useState('5');
  const [umbralRentabilidadAceptablePct, setUmbralRentabilidadAceptablePct] = useState('5');
  const [resultado, setResultado] = useState<AlquilerRentabilidadResultado | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    try {
      const r = calcularAlquilerRentabilidad({
        precioVivienda: Number(precioVivienda),
        entradaPct: Number(entradaPct),
        gastosCompraPct: Number(gastosCompraPct),
        tinHipotecaPct: Number(tinHipotecaPct),
        plazoHipotecaAnios: Number(plazoHipotecaAnios),
        alquilerMensual: Number(alquilerMensual),
        ibiAnual: ibiAnual ? Number(ibiAnual) : 0,
        comunidadMensual: comunidadMensual ? Number(comunidadMensual) : 0,
        seguroHogarAnual: seguroHogarAnual ? Number(seguroHogarAnual) : 0,
        mantenimientoPctAnual: Number(mantenimientoPctAnual),
        gestoriaPctAlquiler: Number(gestoriaPctAlquiler),
        tasaVacioPct: Number(tasaVacioPct),
        umbralRentabilidadAceptablePct: Number(umbralRentabilidadAceptablePct),
      });
      setResultado(r);
    } catch (err) {
      setResultado(null);
      setError(err instanceof Error ? err.message : 'Datos inválidos');
    }
  };

  return (
    <CalculatorCard
      titulo="Comprar para alquilar"
      descripcion="Rentabilidad real de una vivienda como inversión: cash-on-cash return sobre lo que realmente pones de tu bolsillo."
      onSubmit={handleSubmit}
      error={error}
      resultado={
        resultado && (
          <>
            <div className="resultado-linea">
              <span>Inversión inicial necesaria</span>
              <strong>{formatEUR(resultado.inversionInicial)}</strong>
            </div>
            <div className="resultado-linea">
              <span>Cashflow mensual neto</span>
              <strong>{formatEUR(resultado.cashflowMensualNeto)}</strong>
            </div>
            <div className="resultado-linea">
              <span>Cashflow anual neto</span>
              <strong>{formatEUR(resultado.cashflowAnualNeto)}</strong>
            </div>
            <div className="resultado-linea">
              <span>Rentabilidad bruta anual</span>
              <strong>{resultado.rentabilidadBrutaAnualPct.toFixed(2)}%</strong>
            </div>
            <div className="resultado-linea resultado-principal">
              <span>Rentabilidad neta sobre inversión (cash-on-cash)</span>
              <strong>{resultado.rentabilidadNetaSobreInversionPct.toFixed(2)}%</strong>
            </div>
            <p className={`resultado-veredicto ${CLASE_VEREDICTO[resultado.veredicto]}`}>
              {resultado.veredicto}
            </p>
            <p className="calculator-help-text">{resultado.mensaje}</p>
          </>
        )
      }
    >
      <NumberField label="Precio de la vivienda" suffix="€" value={precioVivienda} onChange={setPrecioVivienda} />
      <NumberField label="Entrada" suffix="%" value={entradaPct} onChange={setEntradaPct} />
      <NumberField label="Gastos de compra" suffix="%" value={gastosCompraPct} onChange={setGastosCompraPct} />
      <NumberField label="TIN de la hipoteca" suffix="%" value={tinHipotecaPct} onChange={setTinHipotecaPct} />
      <NumberField label="Plazo de la hipoteca" suffix="años" value={plazoHipotecaAnios} onChange={setPlazoHipotecaAnios} />
      <NumberField label="Alquiler mensual esperado" suffix="€" value={alquilerMensual} onChange={setAlquilerMensual} />
      <NumberField label="IBI anual (opcional)" suffix="€" value={ibiAnual} onChange={setIbiAnual} required={false} />
      <NumberField
        label="Comunidad mensual (opcional)"
        suffix="€"
        value={comunidadMensual}
        onChange={setComunidadMensual}
        required={false}
      />
      <NumberField
        label="Seguro de hogar anual (opcional)"
        suffix="€"
        value={seguroHogarAnual}
        onChange={setSeguroHogarAnual}
        required={false}
      />
      <NumberField
        label="Mantenimiento/reparaciones"
        suffix="% del valor/año"
        value={mantenimientoPctAnual}
        onChange={setMantenimientoPctAnual}
      />
      <NumberField
        label="Gestoría de alquileres"
        suffix="% del alquiler"
        value={gestoriaPctAlquiler}
        onChange={setGestoriaPctAlquiler}
      />
      <NumberField label="Tasa de vacío esperada" suffix="%" value={tasaVacioPct} onChange={setTasaVacioPct} />
      <NumberField
        label="Rentabilidad mínima aceptable"
        suffix="%"
        value={umbralRentabilidadAceptablePct}
        onChange={setUmbralRentabilidadAceptablePct}
      />
    </CalculatorCard>
  );
}
