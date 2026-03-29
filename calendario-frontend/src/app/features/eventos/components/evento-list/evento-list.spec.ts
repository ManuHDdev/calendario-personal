import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EventoList } from './evento-list';

describe('EventoList', () => {
  let component: EventoList;
  let fixture: ComponentFixture<EventoList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventoList]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EventoList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
