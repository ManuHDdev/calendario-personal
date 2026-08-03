import { Component, ElementRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, ValidatorFn, AbstractControl, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { ColorPickerDirective } from 'ngx-color-picker';
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
    MatIconModule,
    ColorPickerDirective
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
  errorApi = signal<string | null>(null);
  eventoId: number | null = null;
  imagenes = signal<ImagenEvento[]>([]);

  private apiError(err: any): string {
    if (err?.status === 0) return 'Sin conexión con el servidor. Comprueba tu red e inténtalo de nuevo.';
    if (err?.status === 403) return 'No tienes permiso para realizar esta acción. Vuelve a iniciar sesión.';
    if (err?.status === 401) return 'Tu sesión ha expirado. Recarga la página para volver a entrar.';
    if (err?.status === 400 && err?.error?.violations?.length) {
      return err.error.violations.map((v: any) => `• ${v.message}`).join('\n');
    }
    if (err?.error?.message) return err.error.message;
    return 'Ha ocurrido un error inesperado. Inténtalo de nuevo.';
  }

  readonly COLORES = [
    '#0071e3','#34c759','#ff9500','#ff3b30','#af52de',
    '#ff2d55','#5856d6','#30b0c7','#32ade6','#64d2ff','#1c1c1e','#8e8e93'
  ];

  form = this.fb.group({
    titulo: ['', [Validators.required, Validators.maxLength(150)]],
    fechaInicio: [null as Date | string | null, Validators.required],
    fechaFin: [null as Date | string | null],
    horaInicio: [''],
    horaFin: [''],
    descripcion: ['', Validators.maxLength(1000)],
    color: ['#0071e3', Validators.required]
  }, { validators: fechaFinValidator });

  ngOnInit(): void {
    // Pre-rellenar fechas desde query params (cuando se viene del calendario con rango seleccionado)
    const qp = this.route.snapshot.queryParamMap;
    const qFechaInicio = qp.get('fechaInicio');
    const qFechaFin = qp.get('fechaFin');
    if (qFechaInicio) {
      this.form.patchValue({ fechaInicio: qFechaInicio, fechaFin: qFechaFin ?? null });
    }

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.modoEdicion.set(true);
      this.eventoId = +id;
      this.cargando.set(true);
      this.eventoService.getEventoById(this.eventoId).subscribe({
        next: (ev) => {
          this.form.patchValue({
            titulo: ev.titulo,
            fechaInicio: ev.fechaInicio ?? null,
            fechaFin: ev.fechaFin ?? null,
            horaInicio: ev.horaInicio ?? '',
            horaFin: ev.horaFin ?? '',
            descripcion: ev.descripcion ?? '',
            color: ev.color
          });
          this.imagenes.set(ev.imagenes ?? []);
          this.cargando.set(false);
        },
        error: (err) => {
          this.errorApi.set(this.apiError(err));
          this.cargando.set(false);
        }
      });
    }
  }

  seleccionarColor(color: string): void {
    this.form.get('color')!.setValue(color);
  }

  private toIsoDate(d: Date | string | null | undefined): string | null {
    if (!d) return null;
    if (typeof d === 'string') return d || null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.errorApi.set(null);
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
          this.errorApi.set(this.apiError(err));
          this.cargando.set(false);
        }
      });
    } else {
      this.eventoService.createEvento(payload).subscribe({
        next: (ev) => {
          this.snackBar.open('Evento creado. Puedes añadir imágenes ahora.', 'OK', { duration: 3000 });
          this.router.navigate(['/eventos', ev.id, 'editar']);
        },
        error: (err) => {
          this.errorApi.set(this.apiError(err));
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

  insertarChecklist(textarea: HTMLTextAreaElement): void {
    const control = this.form.get('descripcion')!;
    const valorActual = (control.value as string) ?? '';
    const inicio = textarea.selectionStart ?? valorActual.length;
    const fin = textarea.selectionEnd ?? valorActual.length;
    const necesitaSaltoLinea = inicio > 0 && valorActual[inicio - 1] !== '\n';
    const snippet = (necesitaSaltoLinea ? '\n' : '') + '- [ ] ';
    const nuevoValor = valorActual.slice(0, inicio) + snippet + valorActual.slice(fin);

    control.setValue(nuevoValor);

    const nuevaPosicion = inicio + snippet.length;
    queueMicrotask(() => {
      textarea.focus();
      textarea.setSelectionRange(nuevaPosicion, nuevaPosicion);
    });
  }
}
