import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { EventoService } from './evento';
import { EventoResumen } from '../../calendario/models/evento-resumen.model';
import { Evento } from '../models/evento.model';

describe('EventoService', () => {
  let service: EventoService;
  let httpMock: HttpTestingController;
  const API = 'http://localhost:8081/api';

  const mockResumen: EventoResumen = {
    id: 1, titulo: 'Test', fechaInicio: '2025-06-01', fechaFin: null, color: '#0071e3'
  };

  const mockEvento: Evento = {
    id: 1, titulo: 'Test', descripcion: null, fechaInicio: '2025-06-01',
    fechaFin: null, horaInicio: null, horaFin: null, color: '#0071e3',
    activo: true, createdAt: '2025-01-01T00:00:00', updatedAt: '2025-01-01T00:00:00', imagenes: []
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), EventoService]
    });
    service = TestBed.inject(EventoService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getEventosByAnio_devuelveLista', () => {
    let result: EventoResumen[] | undefined;
    service.getEventosByAnio(2025).subscribe(r => (result = r));
    const req = httpMock.expectOne(`${API}/eventos?anio=2025`);
    expect(req.request.method).toBe('GET');
    req.flush([mockResumen]);
    expect(result).toEqual([mockResumen]);
  });

  it('getEventoById_devuelveEvento', () => {
    let result: Evento | undefined;
    service.getEventoById(1).subscribe(r => (result = r));
    const req = httpMock.expectOne(`${API}/eventos/1`);
    expect(req.request.method).toBe('GET');
    req.flush(mockEvento);
    expect(result?.id).toBe(1);
  });

  it('createEvento_devuelveEventoCreado', () => {
    let result: Evento | undefined;
    service.createEvento({ titulo: 'Nuevo', fechaInicio: '2025-06-01', color: '#0071e3' })
      .subscribe(r => (result = r));
    const req = httpMock.expectOne(`${API}/eventos`);
    expect(req.request.method).toBe('POST');
    req.flush({ ...mockEvento, id: 99 }, { status: 201, statusText: 'Created' });
    expect(result?.id).toBe(99);
  });

  it('updateEvento_devuelveEventoActualizado', () => {
    let result: Evento | undefined;
    service.updateEvento(1, { titulo: 'Actualizado', fechaInicio: '2025-06-01', color: '#ff0000' })
      .subscribe(r => (result = r));
    const req = httpMock.expectOne(`${API}/eventos/1`);
    expect(req.request.method).toBe('PUT');
    req.flush({ ...mockEvento, titulo: 'Actualizado' });
    expect(result?.titulo).toBe('Actualizado');
  });

  it('deleteEvento_completaSinError', () => {
    let completed = false;
    service.deleteEvento(1).subscribe({ complete: () => (completed = true) });
    const req = httpMock.expectOne(`${API}/eventos/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(completed).toBeTrue();
  });
});
