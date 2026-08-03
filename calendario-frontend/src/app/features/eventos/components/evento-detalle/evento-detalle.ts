import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { EventoService } from '../../services/evento';
import { ImagenEventoService } from '../../services/imagen-evento';
import { Evento, EventoRequest } from '../../models/evento.model';
import { ConfirmDialog } from '../../../../shared/components/confirm-dialog/confirm-dialog';
import { SafeUrlPipe } from '../../../../shared/pipes/safe-url.pipe';
import { LinkifyPipe } from '../../../../shared/pipes/linkify.pipe';

const CHECKLIST_REGEX = /^-\s\[([ xX])\]\s(.*)$/;

type LineaDescripcion =
  | { tipo: 'checklist'; texto: string; marcado: boolean; indice: number }
  | { tipo: 'texto'; texto: string; indice: number }
  | { tipo: 'vacia'; indice: number };

function parsearDescripcion(descripcion: string): LineaDescripcion[] {
  return descripcion.split('\n').map((linea, indice) => {
    const match = linea.match(CHECKLIST_REGEX);
    if (match) {
      return { tipo: 'checklist', texto: match[2], marcado: match[1].toLowerCase() === 'x', indice } as const;
    }
    if (linea.trim() === '') {
      return { tipo: 'vacia', indice } as const;
    }
    return { tipo: 'texto', texto: linea, indice } as const;
  });
}

@Component({
  selector: 'app-evento-detalle',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule, MatProgressSpinnerModule, SafeUrlPipe, LinkifyPipe],
  templateUrl: './evento-detalle.html',
  styleUrl: './evento-detalle.scss'
})
export class EventoDetalle implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly eventoService = inject(EventoService);
  private readonly imagenEventoService = inject(ImagenEventoService);
  private readonly dialog = inject(MatDialog);

  evento = signal<Evento | null>(null);
  cargando = signal(true);
  error = signal<string | null>(null);

  descripcionLineas = computed<LineaDescripcion[]>(() => {
    const descripcion = this.evento()?.descripcion;
    return descripcion ? parsearDescripcion(descripcion) : [];
  });

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.eventoService.getEventoById(id).subscribe({
      next: (ev) => { this.evento.set(ev); this.cargando.set(false); },
      error: () => { this.error.set('No se pudo cargar el evento'); this.cargando.set(false); }
    });
  }

  editarEvento(): void {
    this.router.navigate(['/eventos', this.evento()!.id, 'editar']);
  }

  eliminarEvento(): void {
    const ref = this.dialog.open(ConfirmDialog, {
      panelClass: 'dialog-panel',
      data: { title: 'Eliminar evento', message: '¿Estás seguro de que quieres eliminar este evento? Esta acción no se puede deshacer.' }
    });
    ref.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.eventoService.deleteEvento(this.evento()!.id).subscribe({
          next: () => this.router.navigate(['/calendario']),
          error: () => this.error.set('Error al eliminar el evento')
        });
      }
    });
  }

  eliminarImagen(imagenId: number): void {
    const ev = this.evento();
    if (!ev) return;
    const ref = this.dialog.open(ConfirmDialog, {
      panelClass: 'dialog-panel',
      data: { title: 'Eliminar imagen', message: '¿Eliminar esta imagen del evento?' }
    });
    ref.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.imagenEventoService.deleteImagen(ev.id, imagenId).subscribe({
          next: () => {
            this.evento.update(e => e ? {
              ...e,
              imagenes: e.imagenes.filter(i => i.id !== imagenId)
            } : e);
          },
          error: () => this.error.set('Error al eliminar la imagen')
        });
      }
    });
  }

  volverAlCalendario(): void {
    this.router.navigate(['/calendario']);
  }

  toggleChecklistItem(indice: number): void {
    const ev = this.evento();
    if (!ev || !ev.descripcion) return;

    const lineas = ev.descripcion.split('\n');
    const linea = lineas[indice];
    const match = linea.match(CHECKLIST_REGEX);
    if (!match) return;

    const nuevoMarcador = match[1].toLowerCase() === 'x' ? ' ' : 'x';
    lineas[indice] = linea.replace(CHECKLIST_REGEX, `- [${nuevoMarcador}] $2`);
    const nuevaDescripcion = lineas.join('\n');

    const payload: EventoRequest = {
      titulo: ev.titulo,
      descripcion: nuevaDescripcion,
      fechaInicio: ev.fechaInicio,
      fechaFin: ev.fechaFin,
      horaInicio: ev.horaInicio,
      horaFin: ev.horaFin,
      color: ev.color
    };

    this.eventoService.updateEvento(ev.id, payload).subscribe({
      next: () => this.evento.update(e => e ? { ...e, descripcion: nuevaDescripcion } : e),
      error: () => this.error.set('No se pudo actualizar el checklist')
    });
  }
}
