import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { EventoDetalle } from './evento-detalle';
import { EventoService } from '../../services/evento';
import { ImagenEventoService } from '../../services/imagen-evento';
import { Evento } from '../../models/evento.model';

describe('EventoDetalle', () => {
  let component: EventoDetalle;
  let fixture: ComponentFixture<EventoDetalle>;
  let eventoServiceSpy: jasmine.SpyObj<EventoService>;

  const mockEvento: Evento = {
    id: 1, titulo: 'Test', descripcion: null, fechaInicio: '2026-06-01',
    fechaFin: null, horaInicio: null, horaFin: null, color: '#0071e3',
    activo: true, createdAt: '', updatedAt: '', imagenes: []
  };

  beforeEach(async () => {
    eventoServiceSpy = jasmine.createSpyObj('EventoService', ['getEventoById', 'deleteEvento', 'updateEvento']);
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

  describe('checklist en la descripción', () => {
    const eventoConChecklist: Evento = {
      ...mockEvento,
      descripcion: '- [ ] comprar pan\nnota suelta\n- [x] pagar factura'
    };

    it('parsea líneas de checklist, texto y vacías', () => {
      component.evento.set(eventoConChecklist);
      const lineas = component.descripcionLineas();

      expect(lineas).toEqual([
        { tipo: 'checklist', texto: 'comprar pan', marcado: false, indice: 0 },
        { tipo: 'texto', texto: 'nota suelta', indice: 1 },
        { tipo: 'checklist', texto: 'pagar factura', marcado: true, indice: 2 }
      ]);
    });

    it('marca un ítem, persiste el cambio y actualiza la señal en éxito', () => {
      component.evento.set(eventoConChecklist);
      const actualizado = { ...eventoConChecklist, descripcion: '- [x] comprar pan\nnota suelta\n- [x] pagar factura' };
      eventoServiceSpy.updateEvento.and.returnValue(of(actualizado));

      component.toggleChecklistItem(0);

      expect(eventoServiceSpy.updateEvento).toHaveBeenCalledWith(1, jasmine.objectContaining({
        descripcion: '- [x] comprar pan\nnota suelta\n- [x] pagar factura'
      }));
      expect(component.evento()?.descripcion).toBe('- [x] comprar pan\nnota suelta\n- [x] pagar factura');
    });

    it('desmarca un ítem ya marcado', () => {
      component.evento.set(eventoConChecklist);
      eventoServiceSpy.updateEvento.and.returnValue(of(eventoConChecklist));

      component.toggleChecklistItem(2);

      expect(eventoServiceSpy.updateEvento).toHaveBeenCalledWith(1, jasmine.objectContaining({
        descripcion: '- [ ] comprar pan\nnota suelta\n- [ ] pagar factura'
      }));
    });

    it('no persiste nada si la línea indicada no es un ítem de checklist', () => {
      component.evento.set(eventoConChecklist);

      component.toggleChecklistItem(1);

      expect(eventoServiceSpy.updateEvento).not.toHaveBeenCalled();
    });

    it('señala un error si la persistencia falla', () => {
      component.evento.set(eventoConChecklist);
      eventoServiceSpy.updateEvento.and.returnValue(throwError(() => new Error('fallo')));

      component.toggleChecklistItem(0);

      expect(component.error()).toBe('No se pudo actualizar el checklist');
      expect(component.evento()?.descripcion).toBe(eventoConChecklist.descripcion);
    });
  });
});
