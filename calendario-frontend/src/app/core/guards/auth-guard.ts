import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot } from '@angular/router';
import { AuthGuardData, createAuthGuard } from 'keycloak-angular';
import Keycloak from 'keycloak-js';

const isAccessAllowed = async (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
  authData: AuthGuardData
): Promise<boolean> => {
  const { authenticated } = authData;

  if (!authenticated) {
    const keycloak = inject(Keycloak);
    await keycloak.login({
      redirectUri: window.location.origin + state.url
    });
    return false;
  }

  return true;
};

export const AuthGuard = createAuthGuard<CanActivateFn>(isAccessAllowed);
