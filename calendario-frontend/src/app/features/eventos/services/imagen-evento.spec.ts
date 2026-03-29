import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ImagenEventoService } from './imagen-evento';

describe('ImagenEventoService', () => {
  let service: ImagenEventoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(ImagenEventoService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
