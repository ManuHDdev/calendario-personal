import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EventoTooltip } from './evento-tooltip';

describe('EventoTooltip', () => {
  let component: EventoTooltip;
  let fixture: ComponentFixture<EventoTooltip>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventoTooltip]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EventoTooltip);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
