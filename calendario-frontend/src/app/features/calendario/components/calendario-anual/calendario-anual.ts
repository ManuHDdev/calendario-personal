import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { EventoService } from '../../../eventos/services/evento';
import { EventoResumen } from '../../models/evento-resumen.model';
import { EventoTooltip } from '../evento-tooltip/evento-tooltip';

interface DiaCelda {
  dia: number | null;
  fecha: Date | null;
}

interface MesData {
  nombre: string;
  anio: number;
  mes: number; // 0-based
  celdas: DiaCelda[];
}

@Component({
  selector: 'app-calendario-anual',
  standalone: true,
  imports: [CommonModule, EventoTooltip],
  templateUrl: './calendario-anual.html',
  styleUrl: './calendario-anual.scss'
})
export class CalendarioAnual implements OnInit {
  private readonly eventoService = inject(EventoService);
  private readonly router = inject(Router);

  anio = signal(new Date().getFullYear());
  cargando = signal(false);
  meses = signal<MesData[]>([]);
  eventosPorDia = signal(new Map<string, EventoResumen[]>());

  tooltipEventos: EventoResumen[] | null = null;
  tooltipFecha: Date | null = null;
  tooltipTop = '0px';
  tooltipLeft = '0px';

  readonly NOMBRES_MESES = [
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
  ];
  readonly CABECERAS_DIAS = ['L','M','X','J','V','S','D'];

  ngOnInit(): void {
    this.generarMeses();
    this.cargarEventos();
  }

  private generarMeses(): void {
    const meses: MesData[] = [];
    for (let m = 0; m < 12; m++) {
      const celdas: DiaCelda[] = [];
      const primerDia = new Date(this.anio(), m, 1);
      // getDay() returns 0=Sun..6=Sat; convert to 0=Mon..6=Sun
      let diaSemana = primerDia.getDay();
      diaSemana = diaSemana === 0 ? 6 : diaSemana - 1;
      // padding
      for (let i = 0; i < diaSemana; i++) {
        celdas.push({ dia: null, fecha: null });
      }
      const diasEnMes = new Date(this.anio(), m + 1, 0).getDate();
      for (let d = 1; d <= diasEnMes; d++) {
        celdas.push({ dia: d, fecha: new Date(this.anio(), m, d) });
      }
      meses.push({ nombre: this.NOMBRES_MESES[m], anio: this.anio(), mes: m, celdas });
    }
    this.meses.set(meses);
  }

  private cargarEventos(): void {
    this.cargando.set(true);
    this.eventoService.getEventosByAnio(this.anio()).subscribe({
      next: (eventos) => {
        const mapa = new Map<string, EventoResumen[]>();
        eventos.forEach(ev => {
          const inicio = new Date(ev.fechaInicio + 'T00:00:00');
          const fin = ev.fechaFin ? new Date(ev.fechaFin + 'T00:00:00') : inicio;
          const cur = new Date(inicio);
          while (cur <= fin) {
            const key = this.toKey(cur);
            if (!mapa.has(key)) mapa.set(key, []);
            mapa.get(key)!.push(ev);
            cur.setDate(cur.getDate() + 1);
          }
        });
        this.eventosPorDia.set(mapa);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false)
    });
  }

  private toKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  getEventosDia(fecha: Date): EventoResumen[] {
    return this.eventosPorDia().get(this.toKey(fecha)) ?? [];
  }

  esHoy(fecha: Date): boolean {
    const hoy = new Date();
    return fecha.getFullYear() === hoy.getFullYear() &&
           fecha.getMonth() === hoy.getMonth() &&
           fecha.getDate() === hoy.getDate();
  }

  anioAnterior(): void {
    this.anio.set(this.anio() - 1);
    this.generarMeses();
    this.cargarEventos();
  }

  anioSiguiente(): void {
    this.anio.set(this.anio() + 1);
    this.generarMeses();
    this.cargarEventos();
  }

  onDiaClick(fecha: Date): void {
    const eventos = this.getEventosDia(fecha);
    if (eventos.length > 0) {
      this.router.navigate(['/eventos', eventos[0].id]);
    }
  }

  onDiaMouseEnter(event: MouseEvent, fecha: Date): void {
    const eventos = this.getEventosDia(fecha);
    if (eventos.length === 0) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.tooltipTop = `${rect.bottom + window.scrollY + 4}px`;
    this.tooltipLeft = `${rect.left + window.scrollX}px`;
    this.tooltipFecha = fecha;
    this.tooltipEventos = eventos;
  }

  cerrarTooltip(): void {
    this.tooltipEventos = null;
    this.tooltipFecha = null;
  }

  verDetalle(id: number): void {
    this.cerrarTooltip();
    this.router.navigate(['/eventos', id]);
  }

  trackByIndex(index: number): number {
    return index;
  }

  tieneEventos(fecha: Date | null): boolean {
    if (!fecha) return false;
    return this.getEventosDia(fecha).length > 0;
  }

  getTresPuntos(fecha: Date): EventoResumen[] {
    return this.getEventosDia(fecha).slice(0, 3);
  }

  getMasEventos(fecha: Date): number {
    const total = this.getEventosDia(fecha).length;
    return total > 3 ? total - 3 : 0;
  }
}
