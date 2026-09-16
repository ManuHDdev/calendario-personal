import { useState } from 'react';
import AppLauncher from '../components/AppLauncher';
import ThemeToggle from '../components/ThemeToggle';
import InteresCompuestoCalculator from '../components/calculators/InteresCompuestoCalculator';
import PrestamoMaximoCalculator from '../components/calculators/PrestamoMaximoCalculator';
import AhorroNecesarioCalculator from '../components/calculators/AhorroNecesarioCalculator';
import CuotaMaximaCalculator from '../components/calculators/CuotaMaximaCalculator';
import PrecioMaximoCalculator from '../components/calculators/PrecioMaximoCalculator';
import ColchonCalculator from '../components/calculators/ColchonCalculator';
import DeudaCalculator from '../components/calculators/DeudaCalculator';
import HipotecaTinTaeCalculator from '../components/calculators/HipotecaTinTaeCalculator';
import AlquilerRentabilidadCalculator from '../components/calculators/AlquilerRentabilidadCalculator';
import PreciosViviendaProvincia from '../components/PreciosViviendaProvincia';
import './FinanzasPage.css';

interface CalculadoraDef {
  id: string;
  nombre: string;
  Componente: () => JSX.Element;
}

const CALCULADORAS: CalculadoraDef[] = [
  { id: 'interes-compuesto', nombre: 'Interés compuesto', Componente: InteresCompuestoCalculator },
  { id: 'prestamo-maximo', nombre: 'Préstamo máximo (×4)', Componente: PrestamoMaximoCalculator },
  { id: 'ahorro-necesario', nombre: 'Ahorro necesario', Componente: AhorroNecesarioCalculator },
  { id: 'cuota-maxima', nombre: 'Cuota máxima', Componente: CuotaMaximaCalculator },
  { id: 'precio-maximo', nombre: 'Precio máximo', Componente: PrecioMaximoCalculator },
  { id: 'colchon', nombre: 'Colchón de seguridad', Componente: ColchonCalculator },
  { id: 'deuda', nombre: 'Deuda buena vs. mala', Componente: DeudaCalculator },
  { id: 'hipoteca-tin-tae', nombre: 'Hipoteca: TIN vs. TAE', Componente: HipotecaTinTaeCalculator },
  { id: 'alquiler-rentabilidad', nombre: 'Comprar para alquilar', Componente: AlquilerRentabilidadCalculator },
  { id: 'precios-vivienda', nombre: 'Precios de vivienda por provincia', Componente: PreciosViviendaProvincia },
];

export default function FinanzasPage() {
  const [activa, setActiva] = useState(CALCULADORAS[0].id);
  const actual = CALCULADORAS.find((c) => c.id === activa) ?? CALCULADORAS[0];
  const Calculadora = actual.Componente;

  return (
    <div className="finanzas-layout">
      <header className="finanzas-header">
        <div className="finanzas-header-left">
          <h1 className="finanzas-header-titulo">Finanzas</h1>
        </div>
        <div className="finanzas-header-right">
          <ThemeToggle />
          <AppLauncher />
        </div>
      </header>

      <div className="finanzas-body">
        <nav className="finanzas-tabs" aria-label="Calculadoras">
          {CALCULADORAS.map((c) => (
            <button
              key={c.id}
              className={`finanzas-tab${c.id === activa ? ' finanzas-tab--activa' : ''}`}
              onClick={() => setActiva(c.id)}
            >
              {c.nombre}
            </button>
          ))}
        </nav>

        <main className="finanzas-contenido">
          <Calculadora />
        </main>
      </div>
    </div>
  );
}
