import { useMemo } from 'react';
import keycloak from '../auth/keycloak';

export interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  roles: string[];
  isAdmin: boolean;
  isFamilia: boolean;
  canViewMap: boolean;
  keycloak: typeof keycloak;
}

export function useAuth(): AuthState {
  return useMemo(() => {
    const isAuthenticated = keycloak.authenticated ?? false;
    const token = keycloak.token ?? null;
    const roles: string[] =
      (keycloak.tokenParsed as { realm_access?: { roles?: string[] } })
        ?.realm_access?.roles ?? [];
    const isAdmin   = roles.includes('admin');
    const isFamilia = roles.includes('familia');
    const canViewMap = isAdmin || isFamilia;

    return { isAuthenticated, token, roles, isAdmin, isFamilia, canViewMap, keycloak };
  }, [keycloak.token]);
}
