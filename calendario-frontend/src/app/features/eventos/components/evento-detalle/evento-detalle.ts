import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { EventoService } from '../../services/evento';
import { ImagenEventoService } from '../../services/imagen-evento';
import { Evento } from '../../models/evento.model';
import { ConfirmDialog } from '../../../../shared/components/confirm-dialog/confirm-dialog';
import { SafeUrlPipe } from '../../../../shared/pipes/safe-url.pipe';
import { LinkifyPipe } from '../../../../shared/pipes/linkify.pipe';

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
}
