import { Component, inject } from '@angular/core';
import { Theme } from '../../../core/services/theme';

@Component({
  selector: 'app-theme-toggle',
  templateUrl: './theme-toggle.html',
  styleUrl: './theme-toggle.scss'
})
export class ThemeToggle {
  protected readonly theme = inject(Theme);

  toggle(): void {
    this.theme.toggle();
  }
}
