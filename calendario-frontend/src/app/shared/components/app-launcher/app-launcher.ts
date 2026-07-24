import { Component, inject, HostListener, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Auth } from '../../../core/services/auth';

interface App {
  id: string;
  nombre: string;
  url: string;
  color: string;
  roles: string[] | null; // null = visible para todos
}

function appUrls(): Record<string, string> {
  const local = window.location.hostname === 'localhost';
  return {
    calendario: local ? 'http://localhost:4200'           : '/',
    storage:    local ? 'http://localhost:5173/storage/'  : '/storage/',
    mapacyd:    local ? 'http://localhost:5175/mapacyd/'  : '/mapacyd/',
    panel:      local ? 'http://localhost:5174/panel/'    : '/panel/',
    ytdl:       local ? 'http://localhost:5176/ytdl/'     : '/ytdl/',
  };
}

@Component({
  selector: 'app-app-launcher',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app-launcher.html',
  styleUrl: './app-launcher.scss',
})
export class AppLauncher {
  private readonly auth = inject(Auth);

  abierto = signal(false);

  private readonly TODAS: App[] = [
    { id: 'calendario', nombre: 'Calendario', color: '#0071e3', roles: null,              url: '' },
    { id: 'storage',    nombre: 'Storage',    color: '#5e5ce6', roles: ['admin','familia'], url: '' },
    { id: 'mapacyd',    nombre: 'MapaCYD',    color: '#30d158', roles: ['admin','familia'], url: '' },
    { id: 'panel',      nombre: 'Panel',      color: '#ff9f0a', roles: ['admin'],           url: '' },
    { id: 'ytdl',       nombre: 'Ytdl',       color: '#ff375f', roles: null,                url: '' },
  ];

  get apps(): App[] {
    const urls = appUrls();
    const roles = this.auth.getRoles();
    return this.TODAS
      .filter(a => !a.roles || a.roles.some(r => roles.includes(r)))
      .map(a => ({ ...a, url: urls[a.id] }));
  }

  toggle(): void {
    this.abierto.update(v => !v);
  }

  @HostListener('document:mousedown', ['$event'])
  onClickFuera(event: MouseEvent): void {
    const el = document.querySelector('app-app-launcher');
    if (el && !el.contains(event.target as Node)) {
      this.abierto.set(false);
    }
  }
}
