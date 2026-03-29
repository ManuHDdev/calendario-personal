import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EventoResumen } from '../../models/evento-resumen.model';

@Component({
  selector: 'app-evento-tooltip',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './evento-tooltip.html',
  styleUrl: './evento-tooltip.scss'
})
export class EventoTooltip {
  @Input() eventos: EventoResumen[] = [];
  @Input() fecha: Date = new Date();
  @Output() cerrar = new EventEmitter<void>();
  @Output() verDetalle = new EventEmitter<number>();

  private dentro = false;

  readonly DIAS = ['DOMINGO','LUNES','MARTES','MIÉRCOLES','JUEVES','VIERNES','SÁBADO'];
  readonly MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
                    'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

  getFechaFormateada(): string {
    return `${this.DIAS[this.fecha.getDay()]} ${this.fecha.getDate()} ${this.MESES[this.fecha.getMonth()]}`;
  }

  onMouseEnter(): void { this.dentro = true; }
  onMouseLeave(): void { this.dentro = false; }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (!this.dentro) this.cerrar.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.cerrar.emit();
  }

  onVerDetalle(id: number, event: MouseEvent): void {
    event.stopPropagation();
    this.verDetalle.emit(id);
  }
}
