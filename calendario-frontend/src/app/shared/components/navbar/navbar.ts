import { CUSTOM_ELEMENTS_SCHEMA, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../../../core/services/auth';
import { ThemeToggle } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, ThemeToggle],
  // <bunker-launcher> is the shared app launcher web component loaded from
  // /launcher/launcher.js (see src/index.html), not an Angular component.
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss'
})
export class Navbar {
  protected readonly authService = inject(Auth);

  get launcherRoles(): string {
    return this.authService.getRoles().join(' ');
  }

  get panelUrl(): string {
    return window.location.hostname === 'localhost'
      ? 'http://localhost:5174/panel/'
      : '/panel/';
  }

  logout(): void {
    this.authService.logout();
  }
}
