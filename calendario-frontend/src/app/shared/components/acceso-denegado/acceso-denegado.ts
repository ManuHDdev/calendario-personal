import { Component, inject } from '@angular/core';
import { Auth } from '../../../core/services/auth';

@Component({
  selector: 'app-acceso-denegado',
  standalone: true,
  template: `
    <div class="acceso-denegado">
      <span class="acceso-denegado__icono">🔒</span>
      <p class="acceso-denegado__msg">No tienes permiso para acceder a esta aplicación</p>
      <button class="acceso-denegado__logout" type="button" (click)="logout()">Cerrar sesión</button>
    </div>
  `,
  styles: [`
    .acceso-denegado {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      gap: 12px;
      text-align: center;
      padding: 0 24px;
    }
    .acceso-denegado__icono {
      font-size: 2.5rem;
      opacity: 0.5;
    }
    .acceso-denegado__msg {
      font-size: 1rem;
      color: var(--color-text-secondary);
      margin: 0;
      max-width: 320px;
    }
    .acceso-denegado__logout {
      all: unset;
      cursor: pointer;
      font-size: 0.875rem;
      color: var(--color-accent);
      margin-top: 8px;
      transition: opacity var(--transition);

      &:hover { opacity: 0.7; }
    }
  `]
})
export class AccesoDenegado {
  private readonly authService = inject(Auth);

  logout(): void {
    this.authService.logout();
  }
}
