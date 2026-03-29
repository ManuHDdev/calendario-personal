import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';
import { EventoService } from '../../../eventos/services/evento';
import { EventoResumen } from '../../models/evento-resumen.model';

interface DiaCelda {
  dia: number | null;
  fecha: Date | null;
}

const COLORES = [
  '#0071e3', '#34c759', '#ff9500', '#ff3b30', '#af52de',
  '#ff2d55', '#5856d6', '#30b0c7', '#32ade6', '#64d2ff', '#1c1c1e', '#8e8e93'
];

@Component({
  selector: 'app-calendario-mensual',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './calendario-mensual.html',
  styleUrl: './calendario-mensual.scss'
})
export class CalendarioMensual implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly eventoService = inject(EventoService);

  anio = signal(new Date().getFullYear());
  mes = signal(new Date().getMonth() + 1); // 1-based
  cargando = signal(false);
  eventosPorDia = signal(new Map<string, EventoResumen[]>());

  // Filtros
  busqueda = '';
  colorFiltro: string | null = null;
  readonly COLORES = COLORES;

  private busqueda$ = new Subject<string>();

  readonly NOMBRES_MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  readonly CABECERAS_DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  celdas = computed<DiaCelda[]>(() => {
    const result: DiaCelda[] = [];
    const primerDia = new Date(this.anio(), this.mes() - 1, 1);
    let diaSemana = primerDia.getDay();
    diaSemana = diaSemana === 0 ? 6 : diaSemana - 1;
    for (let i = 0; i < diaSemana; i++) result.push({ dia: null, fecha: null });
    const diasEnMes = new Date(this.anio(), this.mes(), 0).getDate();
    for (let d = 1; d <= diasEnMes; d++) {
      result.push({ dia: d, fecha: new Date(this.anio(), this.mes() - 1, d) });
    }
    return result;
  });

  ngOnInit(): void {
    const params = this.route.snapshot.paramMap;
    const anio = Number(params.get('anio'));
    const mes = Number(params.get('mes'));
    if (anio && mes) {
      this.anio.set(anio);
      this.mes.set(mes);
    }
    this.cargarEventos();

    // Búsqueda con debounce
    this.busqueda$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(() => {
        this.cargando.set(true);
        return this.eventoService.buscarEventos(this.anio(), {
          mes: this.mes(),
          q: this.busqueda || undefined,
          color: this.colorFiltro || undefined
        });
      })
    ).subscribe({
      next: (eventos) => {
        this.mapearEventos(eventos);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false)
    });
  }

  onBusquedaChange(): void {
    this.busqueda$.next(this.busqueda);
  }

  seleccionarColor(color: string): void {
    this.colorFiltro = this.colorFiltro === color ? null : color;
    this.busqueda$.next(this.busqueda);
  }

  limpiarFiltros(): void {
    this.busqueda = '';
    this.colorFiltro = null;
    this.cargarEventos();
  }

  private cargarEventos(): void {
    this.cargando.set(true);
    this.eventoService.getEventosByMes(this.anio(), this.mes()).subscribe({
      next: (eventos) => {
        this.mapearEventos(eventos);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false)
    });
  }

  private mapearEventos(eventos: EventoResumen[]): void {
    const mapa = new Map<string, EventoResumen[]>();
    eventos.forEach(ev => {
      const inicio = new Date(ev.fechaInicio + 'T00:00:00');
      const fin = ev.fechaFin ? new Date(ev.fechaFin + 'T00:00:00') : inicio;
      const primerDiaMes = new Date(this.anio(), this.mes() - 1, 1);
      const ultimoDiaMes = new Date(this.anio(), this.mes(), 0);
      const cur = inicio < primerDiaMes ? new Date(primerDiaMes) : new Date(inicio);
      const limite = fin > ultimoDiaMes ? ultimoDiaMes : fin;
      while (cur <= limite) {
        const key = this.toKey(cur);
        if (!mapa.has(key)) mapa.set(key, []);
        mapa.get(key)!.push(ev);
        cur.setDate(cur.getDate() + 1);
      }
    });
    this.eventosPorDia.set(mapa);
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

  mesAnterior(): void {
    let m = this.mes() - 1;
    let a = this.anio();
    if (m < 1) { m = 12; a--; }
    this.anio.set(a);
    this.mes.set(m);
    this.limpiarFiltros();
    this.router.navigate(['/calendario', a, m]);
  }

  mesSiguiente(): void {
    let m = this.mes() + 1;
    let a = this.anio();
    if (m > 12) { m = 1; a++; }
    this.anio.set(a);
    this.mes.set(m);
    this.limpiarFiltros();
    this.router.navigate(['/calendario', a, m]);
  }

  verDetalle(id: number): void {
    this.router.navigate(['/eventos', id]);
  }

  nuevoEvento(): void {
    this.router.navigate(['/eventos/nuevo']);
  }

  hayFiltrosActivos(): boolean {
    return !!this.busqueda || !!this.colorFiltro;
  }

  trackByIndex(index: number): number {
    return index;
  }
}
