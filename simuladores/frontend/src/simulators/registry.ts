import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export type Category = 'Probabilidad' | 'Geometría' | 'Análisis' | 'Física';

export interface SimulatorDef {
  id: string;
  path: string;
  title: string;
  summary: string;
  category: Category;
  Component: LazyExoticComponent<ComponentType>;
}

/** Single source of truth for the hub cards and the routes (each simulator is lazy-loaded). */
export const SIMULATORS: SimulatorDef[] = [
  {
    id: 'prisioneros',
    path: '/prisioneros',
    title: 'Dilema de los 100 prisioneros',
    summary: 'Una estrategia basada en ciclos de permutaciones salva al grupo el 31 % de las veces en lugar de casi nunca.',
    category: 'Probabilidad',
    Component: lazy(() => import('./prisoners/PrisonersSim')),
  },
  {
    id: 'cardioide',
    path: '/cardioide',
    title: 'Cardioide',
    summary: 'Tablas de multiplicar dibujadas sobre un círculo y un círculo que rueda alrededor de otro.',
    category: 'Geometría',
    Component: lazy(() => import('./cardioid/CardioidSim')),
  },
  {
    id: 'parada-optima',
    path: '/parada-optima',
    title: 'Parada óptima (secretaria)',
    summary: 'Observa al 37 % de los candidatos y elige al primero que los supere a todos.',
    category: 'Probabilidad',
    Component: lazy(() => import('./secretary/SecretarySim')),
  },
  {
    id: 'monty-hall',
    path: '/monty-hall',
    title: 'Monty Hall',
    summary: 'Tres puertas, un coche y por qué cambiar de puerta duplica tus opciones.',
    category: 'Probabilidad',
    Component: lazy(() => import('./montyHall/MontyHallSim')),
  },
  {
    id: 'galton',
    path: '/galton',
    title: 'Tablero de Galton',
    summary: 'Bolas que rebotan al azar y dibujan la distribución binomial y la campana de Gauss.',
    category: 'Probabilidad',
    Component: lazy(() => import('./galton/GaltonSim')),
  },
  {
    id: 'pi',
    path: '/pi',
    title: 'Estimación de π',
    summary: 'Puntos al azar en un cuadrado y agujas de Buffon sobre un suelo de tablas.',
    category: 'Probabilidad',
    Component: lazy(() => import('./pi/PiSim')),
  },
  {
    id: 'fourier',
    path: '/fourier',
    title: 'Series de Fourier',
    summary: 'Epiciclos que giran y suman senos hasta formar ondas cuadradas, de sierra y triangulares.',
    category: 'Análisis',
    Component: lazy(() => import('./fourier/FourierSim')),
  },
  {
    id: 'pendulo-doble',
    path: '/pendulo-doble',
    title: 'Péndulo doble',
    summary: 'Caos determinista: dos péndulos casi idénticos que acaban sin parecerse en nada.',
    category: 'Física',
    Component: lazy(() => import('./doublePendulum/DoublePendulumSim')),
  },
];
