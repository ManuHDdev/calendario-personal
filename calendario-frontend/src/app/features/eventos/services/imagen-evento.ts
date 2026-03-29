import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, Observable, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ImagenEvento } from '../models/imagen-evento.model';

@Injectable({
  providedIn: 'root'
})
export class ImagenEventoService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  addImagen(eventoId: number, file: File): Observable<ImagenEvento> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http
      .post<ImagenEvento>(`${this.apiUrl}/eventos/${eventoId}/imagenes`, formData)
      .pipe(catchError(err => throwError(() => err)));
  }

  deleteImagen(eventoId: number, imagenId: number): Observable<void> {
    return this.http
      .delete<void>(`${this.apiUrl}/eventos/${eventoId}/imagenes/${imagenId}`)
      .pipe(catchError(err => throwError(() => err)));
  }
}
