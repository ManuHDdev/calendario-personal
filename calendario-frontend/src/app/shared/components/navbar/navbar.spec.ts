import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import Keycloak from 'keycloak-js';
import { Navbar } from './navbar';

describe('Navbar', () => {
  let component: Navbar;
  let fixture: ComponentFixture<Navbar>;

  const keycloakMock = jasmine.createSpyObj('Keycloak', ['logout'], {
    authenticated: true,
    tokenParsed: {
      preferred_username: 'propietario',
      realm_access: { roles: ['admin', 'familia'] }
    }
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Navbar],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Keycloak, useValue: keycloakMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Navbar);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the shared <bunker-launcher> with the user realm roles', () => {
    const launcher: HTMLElement | null = fixture.nativeElement.querySelector('bunker-launcher');
    expect(launcher).not.toBeNull();
    expect(launcher!.getAttribute('roles')).toBe('admin familia');
  });

  it('no longer renders the old Angular app launcher', () => {
    expect(fixture.nativeElement.querySelector('app-app-launcher')).toBeNull();
  });
});
