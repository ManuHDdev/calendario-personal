import type { TipoBusqueda } from '../types/locales';
import type { PortalProvider } from './types';
import { fotocasaProvider } from './fotocasa';
import { pisosComProvider } from './pisoscom';
import { habitacliaProvider } from './habitaclia';
import { yaencontreProvider } from './yaencontre';
import { milanunciosProvider } from './milanuncios';
import { farmaconsultingProvider } from './farmaconsulting';
import { asefarmaProvider } from './asefarma';
import { negociosEnVentaProvider } from './negociosenventa';
import { tablonDeAnunciosProvider } from './tablondeanuncios';
import { milanunciosFarmaciasProvider } from './milanunciosFarmacias';

/** Portales de locales comerciales en venta. */
export const PROVIDERS_LOCAL: Record<string, PortalProvider> = {
  [fotocasaProvider.id]: fotocasaProvider,
  [pisosComProvider.id]: pisosComProvider,
  [habitacliaProvider.id]: habitacliaProvider,
  [yaencontreProvider.id]: yaencontreProvider,
  [milanunciosProvider.id]: milanunciosProvider,
};

/** Portales de farmacias en funcionamiento en venta. */
export const PROVIDERS_FARMACIA: Record<string, PortalProvider> = {
  [farmaconsultingProvider.id]: farmaconsultingProvider,
  [asefarmaProvider.id]: asefarmaProvider,
  [negociosEnVentaProvider.id]: negociosEnVentaProvider,
  [tablonDeAnunciosProvider.id]: tablonDeAnunciosProvider,
  [milanunciosFarmaciasProvider.id]: milanunciosFarmaciasProvider,
};

const TODOS: Record<string, PortalProvider> = { ...PROVIDERS_LOCAL, ...PROVIDERS_FARMACIA };

/** Ids válidos para `busqueda.portales`, por tipo. */
export const PORTALES_POR_TIPO: Record<TipoBusqueda, readonly string[]> = {
  local: Object.keys(PROVIDERS_LOCAL),
  farmacia: Object.keys(PROVIDERS_FARMACIA),
};

export function getProvider(id: string): PortalProvider | undefined {
  return TODOS[id];
}

export function providersParaTipo(tipo: TipoBusqueda): PortalProvider[] {
  return Object.values(tipo === 'farmacia' ? PROVIDERS_FARMACIA : PROVIDERS_LOCAL);
}

/** Todos los providers, de cualquier tipo. Lo usa el bot para leer una URL. */
export function todosLosProviders(): PortalProvider[] {
  return Object.values(TODOS);
}

export type { PortalProvider, CriteriosPortal, OpcionesBusqueda } from './types';
