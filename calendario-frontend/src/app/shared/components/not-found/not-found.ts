import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="not-found">
      <span class="not-found__code">404</span>
      <p class="not-found__msg">Esta página no existe</p>
      <a class="not-found__link" routerLink="/calendario">Volver al calendario</a>
    </div>
  `,
  styles: [`
    .not-found {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: calc(100vh - 56px);
      gap: 12px;
    }
    .not-found__code {
      font-size: 6rem;
      font-weight: 200;
      color: var(--color-border);
      line-height: 1;
    }
    .not-found__msg {
      font-size: 1rem;
      color: var(--color-text-secondary);
      margin: 0;
    }
    .not-found__link {
      font-size: 0.875rem;
      color: var(--color-accent);
      text-decoration: none;
      margin-top: 8px;
      &:hover { opacity: 0.7; }
    }
  `]
})
export class NotFound {}
