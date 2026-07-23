import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../../../core/services/auth';
import { AppLauncher } from '../app-launcher/app-launcher';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, AppLauncher],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss'
})
export class Navbar {
  protected readonly authService = inject(Auth);

  get panelUrl(): string {
    return window.location.hostname === 'localhost'
      ? 'http://localhost:5174/panel/'
      : '/panel/';
  }

  logout(): void {
    this.authService.logout();
  }
}
