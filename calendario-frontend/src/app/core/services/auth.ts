import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import Keycloak from 'keycloak-js';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class Auth {
  private readonly keycloak = inject(Keycloak);
  private readonly http = inject(HttpClient);

  async logout(): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(`${environment.apiUrl}/auth/logout`, {})
      );
    } finally {
      // Cierra la sesión en Keycloak independientemente del resultado del backend
      await this.keycloak.logout({ redirectUri: window.location.origin });
    }
  }

  getUserName(): string {
    return (this.keycloak.tokenParsed?.['preferred_username'] as string) ?? '';
  }

  getRoles(): string[] {
    return (this.keycloak.tokenParsed?.['realm_access'] as { roles?: string[] })?.roles ?? [];
  }

  hasRole(role: string): boolean {
    return this.getRoles().includes(role);
  }

  isAdmin(): boolean {
    return this.hasRole('admin');
  }

  isLoggedIn(): boolean {
    return this.keycloak.authenticated ?? false;
  }
}
