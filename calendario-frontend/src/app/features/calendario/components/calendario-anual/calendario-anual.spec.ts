import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CalendarioAnual } from './calendario-anual';
import { EventoService } from '../../../eventos/services/evento';
import { EventoResumen } from '../../models/evento-resumen.model';

describe('CalendarioAnual', () => {
  let component: CalendarioAnual;
  let fixture: ComponentFixture<CalendarioAnual>;
  let eventoServiceSpy: jasmine.SpyObj<EventoService>;

  const anioActual = new Date().getFullYear();
  const mockEventos: EventoResumen[] = [
    { id: 1, titulo: 'Evento A', fechaInicio: `${anioActual}-03-15`, fechaFin: null, color: '#ff0000' }
  ];

  beforeEach(async () => {
    eventoServiceSpy = jasmine.createSpyObj('EventoService', ['getEventosByAnio']);
    eventoServiceSpy.getEventosByAnio.and.returnValue(of(mockEventos));

    await TestBed.configureTestingModule({
      imports: [CalendarioAnual],
      providers: [
        provideRouter([]),
        { provide: EventoService, useValue: eventoServiceSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CalendarioAnual);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('crea el componente sin error', () => {
    expect(component).toBeTruthy();
  });

  it('ngOnInit llama a getEventosByAnio con el año actual', fakeAsync(() => {
    tick();
    expect(eventoServiceSpy.getEventosByAnio).toHaveBeenCalledWith(anioActual);
  }));

  it('renderiza 12 secciones de mes', () => {
    const tarjetas = fixture.nativeElement.querySelectorAll('.tarjeta-mes');
    expect(tarjetas.length).toBe(12);
  });

  it('días con eventos tienen al menos un punto de color', fakeAsync(() => {
    tick();
    fixture.detectChanges();
    const barras = fixture.nativeElement.querySelectorAll('.barra-evento');
    expect(barras.length).toBeGreaterThan(0);
  }));

  it('click en año siguiente incrementa el año y recarga', fakeAsync(() => {
    const anioInicial = component.anio();
    const btnSiguiente = fixture.nativeElement.querySelector('.nav-btn:last-of-type');
    btnSiguiente.click();
    tick();
    expect(component.anio()).toBe(anioInicial + 1);
    expect(eventoServiceSpy.getEventosByAnio).toHaveBeenCalledWith(anioInicial + 1);
  }));
});
