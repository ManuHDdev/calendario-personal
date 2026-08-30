import type { PortalId } from '../types/pisos';
import type { PortalProvider } from './types';
import { fotocasaProvider } from './fotocasa';
import { pisosComProvider } from './pisoscom';
import { wallapopProvider } from './wallapop';

export const PROVIDERS: Record<PortalId, PortalProvider> = {
  fotocasa: fotocasaProvider,
  pisos: pisosComProvider,
  wallapop: wallapopProvider,
};

export function getProvider(id: PortalId): PortalProvider {
  return PROVIDERS[id];
}

export type { PortalProvider, CriteriosPortal, OpcionesBusqueda } from './types';
