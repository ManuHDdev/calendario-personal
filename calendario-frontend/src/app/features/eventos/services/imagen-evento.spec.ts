import { TestBed } from '@angular/core/testing';

import { ImagenEvento } from './imagen-evento';

describe('ImagenEvento', () => {
  let service: ImagenEvento;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ImagenEvento);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
