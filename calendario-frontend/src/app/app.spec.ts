import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import Keycloak from 'keycloak-js';
import { App } from './app';

describe('App', () => {
  const buildKeycloakMock = (roles: string[]) =>
    jasmine.createSpyObj('Keycloak', ['logout'], {
      authenticated: true,
      tokenParsed: { preferred_username: 'propietario', realm_access: { roles } }
    });

  const configure = async (keycloakMock: unknown) => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Keycloak, useValue: keycloakMock }
      ]
    }).compileComponents();
  };

  it('should create the app', async () => {
    await configure(buildKeycloakMock(['admin']));
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render navbar for an admin user', async () => {
    await configure(buildKeycloakMock(['admin']));
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-navbar')).toBeTruthy();
  });

  it('should not render navbar for a non-admin user', async () => {
    await configure(buildKeycloakMock(['familia']));
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-navbar')).toBeFalsy();
  });
});
