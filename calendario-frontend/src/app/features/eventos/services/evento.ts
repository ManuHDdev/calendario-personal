import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { catchError, Observable, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Evento, EventoRequest } from '../models/evento.model';
import { EventoResumen } from '../../calendario/models/evento-resumen.model';

@Injectable({
  providedIn: 'root'
})
export class EventoService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  getEventosByAnio(anio: number): Observable<EventoResumen[]> {
    const params = new HttpParams().set('anio', anio.toString());
    return this.http.get<EventoResumen[]>(`${this.apiUrl}/eventos`, { params }).pipe(
      catchError(err => throwError(() => err))
    );
  }

  getEventosByMes(anio: number, mes: number): Observable<EventoResumen[]> {
    const params = new HttpParams().set('anio', anio.toString()).set('mes', mes.toString());
    return this.http.get<EventoResumen[]>(`${this.apiUrl}/eventos`, { params }).pipe(
      catchError(err => throwError(() => err))
    );
  }

  buscarEventos(anio: number, opts: { mes?: number; q?: string; color?: string }): Observable<EventoResumen[]> {
    let params = new HttpParams().set('anio', anio.toString());
    if (opts.mes != null) params = params.set('mes', opts.mes.toString());
    if (opts.q) params = params.set('q', opts.q);
    if (opts.color) params = params.set('color', opts.color);
    return this.http.get<EventoResumen[]>(`${this.apiUrl}/eventos`, { params }).pipe(
      catchError(err => throwError(() => err))
    );
  }

  getEventoById(id: number): Observable<Evento> {
    return this.http.get<Evento>(`${this.apiUrl}/eventos/${id}`).pipe(
      catchError(err => throwError(() => err))
    );
  }

  createEvento(data: EventoRequest): Observable<Evento> {
    return this.http.post<Evento>(`${this.apiUrl}/eventos`, data).pipe(
      catchError(err => throwError(() => err))
    );
  }

  updateEvento(id: number, data: EventoRequest): Observable<Evento> {
    return this.http.put<Evento>(`${this.apiUrl}/eventos/${id}`, data).pipe(
      catchError(err => throwError(() => err))
    );
  }

  deleteEvento(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/eventos/${id}`).pipe(
      catchError(err => throwError(() => err))
    );
  }
}
