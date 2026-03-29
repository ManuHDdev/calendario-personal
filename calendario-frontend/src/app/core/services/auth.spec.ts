import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Auth } from './auth';
import Keycloak from 'keycloak-js';

describe('Auth', () => {
  let service: Auth;
  let httpMock: HttpTestingController;
  let keycloakMock: jasmine.SpyObj<Keycloak>;

  beforeEach(() => {
    keycloakMock = jasmine.createSpyObj('Keycloak', ['logout'], {
      authenticated: true,
      tokenParsed: { preferred_username: 'propietario' }
    });
    keycloakMock.logout.and.returnValue(Promise.resolve());

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        Auth,
        { provide: Keycloak, useValue: keycloakMock }
      ]
    });
    service = TestBed.inject(Auth);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('logout llama a POST /auth/logout y luego a keycloak.logout()', fakeAsync(() => {
    service.logout();
    const req = httpMock.expectOne('http://localhost:8081/api/auth/logout');
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
    tick();
    expect(keycloakMock.logout).toHaveBeenCalled();
  }));

  it('isLoggedIn devuelve el estado de keycloak.authenticated', () => {
    expect(service.isLoggedIn()).toBeTrue();
  });

  it('getUserName devuelve preferred_username del token', () => {
    expect(service.getUserName()).toBe('propietario');
  });
});
