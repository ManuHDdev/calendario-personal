import { Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth-guard';
import { AdminGuard } from './core/guards/admin-guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'calendario',
    pathMatch: 'full'
  },
  {
    path: 'calendario',
    loadComponent: () =>
      import('./features/calendario/components/calendario-anual/calendario-anual').then(
        (m) => m.CalendarioAnual
      ),
    canActivate: [AuthGuard, AdminGuard]
  },
  {
    path: 'eventos/nuevo',
    loadComponent: () =>
      import('./features/eventos/components/evento-form/evento-form').then(
        (m) => m.EventoForm
      ),
    canActivate: [AuthGuard, AdminGuard]
  },
  {
    path: 'eventos/:id',
    loadComponent: () =>
      import('./features/eventos/components/evento-detalle/evento-detalle').then(
        (m) => m.EventoDetalle
      ),
    canActivate: [AuthGuard, AdminGuard]
  },
  {
    path: 'eventos/:id/editar',
    loadComponent: () =>
      import('./features/eventos/components/evento-form/evento-form').then(
        (m) => m.EventoForm
      ),
    canActivate: [AuthGuard, AdminGuard]
  },
  {
    path: 'calendario/:anio/:mes',
    loadComponent: () =>
      import('./features/calendario/components/calendario-mensual/calendario-mensual').then(
        (m) => m.CalendarioMensual
      ),
    canActivate: [AuthGuard, AdminGuard]
  },
  {
    path: 'acceso-denegado',
    loadComponent: () =>
      import('./shared/components/acceso-denegado/acceso-denegado').then(
        (m) => m.AccesoDenegado
      ),
    canActivate: [AuthGuard]
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./core/components/auth-callback/auth-callback').then(
        (m) => m.AuthCallback
      )
  },
  {
    path: '**',
    loadComponent: () =>
      import('./shared/components/not-found/not-found').then(
        (m) => m.NotFound
      )
  }
];
