import { TestBed } from '@angular/core/testing';
import { CanActivateFn, provideRouter, Router, UrlTree } from '@angular/router';

import { AdminGuard } from './admin-guard';
import { Auth } from '../services/auth';

describe('AdminGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => AdminGuard(...guardParameters));

  let authSpy: jasmine.SpyObj<Auth>;
  let router: Router;

  beforeEach(() => {
    authSpy = jasmine.createSpyObj('Auth', ['isAdmin']);

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Auth, useValue: authSpy }
      ]
    });

    router = TestBed.inject(Router);
  });

  it('permite el acceso si el usuario es admin', () => {
    authSpy.isAdmin.and.returnValue(true);

    const resultado = executeGuard({} as any, {} as any);

    expect(resultado).toBeTrue();
  });

  it('redirige a /acceso-denegado si el usuario no es admin', () => {
    authSpy.isAdmin.and.returnValue(false);

    const resultado = executeGuard({} as any, {} as any) as UrlTree;

    expect(resultado instanceof UrlTree).toBeTrue();
    expect(router.serializeUrl(resultado)).toBe('/acceso-denegado');
  });
});
