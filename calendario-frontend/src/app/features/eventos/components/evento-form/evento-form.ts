import { Component, ElementRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, ValidatorFn, AbstractControl, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { EventoService } from '../../services/evento';
import { ImagenEventoService } from '../../services/imagen-evento';
import { EventoRequest } from '../../models/evento.model';
import { ImagenEvento } from '../../models/imagen-evento.model';

const fechaFinValidator: ValidatorFn = (group: AbstractControl) => {
  const inicio = group.get('fechaInicio')?.value;
  const fin = group.get('fechaFin')?.value;
  if (inicio && fin && new Date(fin) < new Date(inicio)) {
    return { fechaFinInvalida: true };
  }
  return null;
};

@Component({
  selector: 'app-evento-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatSnackBarModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatIconModule
  ],
  templateUrl: './evento-form.html',
  styleUrl: './evento-form.scss'
})
export class EventoForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly eventoService = inject(EventoService);
  private readonly imagenEventoService = inject(ImagenEventoService);
  private readonly snackBar = inject(MatSnackBar);

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  modoEdicion = signal(false);
  cargando = signal(false);
  subiendoImagen = signal(false);
  eventoId: number | null = null;
  imagenes = signal<ImagenEvento[]>([]);

  readonly COLORES = [
    '#0071e3','#34c759','#ff9500','#ff3b30','#af52de',
    '#ff2d55','#5856d6','#30b0c7','#32ade6','#64d2ff','#1c1c1e','#8e8e93'
  ];

  form = this.fb.group({
    titulo: ['', [Validators.required, Validators.maxLength(150)]],
    fechaInicio: [null as Date | null, Validators.required],
    fechaFin: [null as Date | null],
    horaInicio: [''],
    horaFin: [''],
    descripcion: ['', Validators.maxLength(1000)],
    color: ['#0071e3', Validators.required]
  }, { validators: fechaFinValidator });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.modoEdicion.set(true);
      this.eventoId = +id;
      this.cargando.set(true);
      this.eventoService.getEventoById(this.eventoId).subscribe({
        next: (ev) => {
          this.form.patchValue({
            titulo: ev.titulo,
            fechaInicio: ev.fechaInicio ? new Date(ev.fechaInicio + 'T00:00:00') : null,
            fechaFin: ev.fechaFin ? new Date(ev.fechaFin + 'T00:00:00') : null,
            horaInicio: ev.horaInicio ?? '',
            horaFin: ev.horaFin ?? '',
            descripcion: ev.descripcion ?? '',
            color: ev.color
          });
          this.imagenes.set(ev.imagenes ?? []);
          this.cargando.set(false);
        },
        error: () => {
          this.snackBar.open('Error al cargar el evento', 'Cerrar', { duration: 3000 });
          this.cargando.set(false);
        }
      });
    }
  }

  seleccionarColor(color: string): void {
    this.form.get('color')!.setValue(color);
  }

  private toIsoDate(d: Date | null | undefined): string | null {
    if (!d) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.cargando.set(true);

    const v = this.form.value;
    const payload: EventoRequest = {
      titulo: v.titulo!,
      descripcion: v.descripcion || null,
      fechaInicio: this.toIsoDate(v.fechaInicio)!,
      fechaFin: this.toIsoDate(v.fechaFin ?? null),
      horaInicio: v.horaInicio || null,
      horaFin: v.horaFin || null,
      color: v.color!
    };

    if (this.modoEdicion() && this.eventoId) {
      this.eventoService.updateEvento(this.eventoId, payload).subscribe({
        next: (ev) => {
          this.snackBar.open('Evento actualizado', 'OK', { duration: 3000 });
          this.router.navigate(['/eventos', ev.id]);
        },
        error: (err) => {
          this.snackBar.open(err?.error?.message ?? 'Error al actualizar', 'Cerrar', { duration: 4000 });
          this.cargando.set(false);
        }
      });
    } else {
      this.eventoService.createEvento(payload).subscribe({
        next: () => {
          this.snackBar.open('Evento creado', 'OK', { duration: 3000 });
          this.router.navigate(['/calendario']);
        },
        error: (err) => {
          this.snackBar.open(err?.error?.message ?? 'Error al crear', 'Cerrar', { duration: 4000 });
          this.cargando.set(false);
        }
      });
    }
  }

  triggerFileInput(): void {
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length || !this.eventoId) return;
    const file = input.files[0];
    this.subiendoImagen.set(true);
    this.imagenEventoService.addImagen(this.eventoId, file).subscribe({
      next: (img) => {
        this.imagenes.update(list => [...list, img]);
        this.subiendoImagen.set(false);
        input.value = '';
      },
      error: (err) => {
        this.snackBar.open(err?.error?.message ?? 'Error al subir imagen', 'Cerrar', { duration: 4000 });
        this.subiendoImagen.set(false);
      }
    });
  }

  eliminarImagen(imagenId: number): void {
    if (!this.eventoId) return;
    if (!window.confirm('¿Eliminar esta imagen?')) return;
    this.imagenEventoService.deleteImagen(this.eventoId, imagenId).subscribe({
      next: () => this.imagenes.update(list => list.filter(i => i.id !== imagenId)),
      error: () => this.snackBar.open('Error al eliminar imagen', 'Cerrar', { duration: 3000 })
    });
  }

  volver(): void {
    this.router.navigate(['/calendario']);
  }
}
