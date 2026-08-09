import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'theme';

@Injectable({
  providedIn: 'root'
})
export class Theme {
  readonly current = signal<ThemeMode>(this.resolveInitialTheme());

  toggle(): void {
    const next: ThemeMode = this.current() === 'dark' ? 'light' : 'dark';
    this.apply(next);
  }

  private apply(theme: ThemeMode): void {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
    this.current.set(theme);
  }

  private resolveInitialTheme(): ThemeMode {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') {
      return attr;
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
