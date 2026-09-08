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
    gastos:     local ? 'http://localhost:5177/gastos/'   : '/gastos/',
    ofertas:    local ? 'http://localhost:5178/ofertas/'  : '/ofertas/',
    paraisos:   local ? 'http://localhost:5179/paraisos/' : '/paraisos/',
    juegos:     local ? 'http://localhost:5180/juegos/'   : '/juegos/',
    watchlist:  local ? 'http://localhost:5181/watchlist/' : '/watchlist/',
    reparto:    local ? 'http://localhost:5182/reparto/'   : '/reparto/',
    ruta:       local ? 'http://localhost:5183/ruta/'      : '/ruta/',
    pisos:      local ? 'http://localhost:5184/pisos/'    : '/pisos/',
    locales:    local ? 'http://localhost:5185/locales/'  : '/locales/',
    trader:     local ? 'http://localhost:5183/trader/'    : '/trader/',
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
    { id: 'calendario', nombre: 'Calendario', color: '#0071e3', roles: ['admin'],          url: '' },
    { id: 'storage',    nombre: 'Storage',    color: '#5e5ce6', roles: ['admin','familia'], url: '' },
    { id: 'mapacyd',    nombre: 'MapaCYD',    color: '#30d158', roles: ['admin','familia','mapacyd_admin','mapacyd_invitado'], url: '' },
    { id: 'panel',      nombre: 'Panel',      color: '#ff9f0a', roles: null,                url: '' },
    { id: 'ytdl',       nombre: 'Ytdl',       color: '#ff375f', roles: null,                url: '' },
    { id: 'gastos',     nombre: 'Gastos',     color: '#ffd60a', roles: ['admin'],           url: '' },
    { id: 'ofertas',    nombre: 'Ofertas',    color: '#bf5af2', roles: ['admin'],           url: '' },
    { id: 'paraisos',   nombre: 'Paraísos',   color: '#00c7be', roles: null,                url: '' },
    // juegos: primera subapp abierta a CUALQUIER rol autenticado (admin,
    // familia, invitado) — no confundir con `roles: null` de ytdl/paraisos,
    // que son públicas sin sesión. Aquí sí se exige login, pero ningún rol
    // concreto (ver design.md "Access guard: any valid role").
    { id: 'juegos',     nombre: 'Juegos',     color: '#ff453a', roles: ['admin','familia','invitado'], url: '' },
    { id: 'watchlist',  nombre: 'Watchlist',  color: '#64d2ff', roles: ['admin'],           url: '' },
    { id: 'reparto',    nombre: 'Reparto',    color: '#a2845e', roles: ['admin','reparto_admin','reparto_invitado'], url: '' },
    { id: 'ruta',       nombre: 'Ruta',       color: '#e07a5f', roles: ['admin'],           url: '' },
    { id: 'pisos',      nombre: 'Pisos',      color: '#7cb518', roles: ['admin'],           url: '' },
    { id: 'locales',    nombre: 'Locales',    color: '#c97b3c', roles: ['admin'],           url: '' },
    { id: 'trader',     nombre: 'Trader',     color: '#32d74b', roles: ['admin'], url: '' },
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
