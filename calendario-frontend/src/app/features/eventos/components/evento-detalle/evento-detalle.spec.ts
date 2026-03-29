import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { EventoDetalle } from './evento-detalle';
import { EventoService } from '../../services/evento';
import { ImagenEventoService } from '../../services/imagen-evento';
import { Evento } from '../../models/evento.model';

describe('EventoDetalle', () => {
  let component: EventoDetalle;
  let fixture: ComponentFixture<EventoDetalle>;

  const mockEvento: Evento = {
    id: 1, titulo: 'Test', descripcion: null, fechaInicio: '2026-06-01',
    fechaFin: null, horaInicio: null, horaFin: null, color: '#0071e3',
    activo: true, createdAt: '', updatedAt: '', imagenes: []
  };

  beforeEach(async () => {
    const eventoServiceSpy = jasmine.createSpyObj('EventoService', ['getEventoById', 'deleteEvento']);
    eventoServiceSpy.getEventoById.and.returnValue(of(mockEvento));
    const imagenServiceSpy = jasmine.createSpyObj('ImagenEventoService', ['addImagen', 'deleteImagen']);

    await TestBed.configureTestingModule({
      imports: [EventoDetalle, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: EventoService, useValue: eventoServiceSpy },
        { provide: ImagenEventoService, useValue: imagenServiceSpy },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '1' } } } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(EventoDetalle);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
