import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { EventoForm } from './evento-form';
import { EventoService } from '../../services/evento';
import { ImagenEventoService } from '../../services/imagen-evento';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Evento } from '../../models/evento.model';

describe('EventoForm', () => {
  let component: EventoForm;
  let fixture: ComponentFixture<EventoForm>;
  let eventoServiceSpy: jasmine.SpyObj<EventoService>;
  let imagenServiceSpy: jasmine.SpyObj<ImagenEventoService>;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;

  const mockEvento: Evento = {
    id: 1, titulo: 'Test', descripcion: null, fechaInicio: '2025-06-01',
    fechaFin: null, horaInicio: null, horaFin: null, color: '#0071e3',
    activo: true, createdAt: '', updatedAt: '', imagenes: []
  };

  beforeEach(async () => {
    eventoServiceSpy = jasmine.createSpyObj('EventoService', ['createEvento', 'updateEvento', 'getEventoById']);
    imagenServiceSpy = jasmine.createSpyObj('ImagenEventoService', ['addImagen', 'deleteImagen']);
    snackBarSpy = jasmine.createSpyObj('MatSnackBar', ['open']);
    eventoServiceSpy.createEvento.and.returnValue(of(mockEvento));

    await TestBed.configureTestingModule({
      imports: [EventoForm, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        { provide: EventoService, useValue: eventoServiceSpy },
        { provide: ImagenEventoService, useValue: imagenServiceSpy },
        { provide: MatSnackBar, useValue: snackBarSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: () => null },
              queryParamMap: { get: () => null }
            }
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(EventoForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('crea el componente en modo creación', () => {
    expect(component).toBeTruthy();
    expect(component.modoEdicion()).toBeFalse();
  });

  it('formulario inválido si titulo está vacío', () => {
    component.form.get('titulo')?.setValue('');
    component.form.get('fechaInicio')?.setValue(new Date());
    expect(component.form.get('titulo')?.invalid).toBeTrue();
  });

  it('formulario inválido si fechaInicio está vacía', () => {
    component.form.get('titulo')?.setValue('Evento válido');
    component.form.get('fechaInicio')?.setValue(null);
    expect(component.form.get('fechaInicio')?.invalid).toBeTrue();
  });

  it('validación cruzada: fechaFin antes de fechaInicio invalida el form', () => {
    component.form.patchValue({
      titulo: 'Test',
      fechaInicio: new Date('2025-06-10'),
      fechaFin: new Date('2025-06-01')
    });
    expect(component.form.hasError('fechaFinInvalida')).toBeTrue();
  });

  it('seleccionarColor actualiza el control color del formulario (usado por la paleta y por el color picker personalizado)', () => {
    component.seleccionarColor('#123abc');
    expect(component.form.get('color')?.value).toBe('#123abc');
  });

  it('escribir un código hex directamente en el input actualiza el control color', () => {
    component.form.get('color')?.setValue('#ff00aa');
    expect(component.form.get('color')?.value).toBe('#ff00aa');
    expect(component.form.get('color')?.valid).toBeTrue();
  });

  it('submit válido en modo creación llama a createEvento y navega a /calendario', fakeAsync(() => {
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    component.form.patchValue({
      titulo: 'Nuevo Evento',
      fechaInicio: new Date('2025-06-01'),
      color: '#0071e3'
    });
    expect(component.form.valid).toBeTrue();
    component.onSubmit();
    tick();
    expect(eventoServiceSpy.createEvento).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/eventos', mockEvento.id, 'editar']);
  }));
});
