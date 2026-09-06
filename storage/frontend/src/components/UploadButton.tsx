import { useRef, useState, useCallback, useEffect } from 'react';
import { uploadFileResumable } from '../services/api';
import type { FileItem } from '../types';
import ProgressBar from './ProgressBar';
import './UploadButton.css';

const ACCEPTED = '.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.mp4,.mov,.avi,.mkv,.webm,.pdf';

interface Props {
  folder?: string;
  onUploaded: (file: FileItem) => void;
}

interface UploadTask {
  id: number;
  name: string;
  progress: number;
  done: boolean;
  error?: string;
  /** Se está esperando para reintentar un trozo tras un corte de red. */
  retrying?: boolean;
}

let nextTaskId = 0;

export default function UploadButton({ folder, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [dragging, setDragging] = useState(false);

  // Las tareas se identifican por id y no por posición: al poder descartar un
  // error, los índices se mueven y una actualización por índice acabaría
  // escribiendo el progreso encima de otra subida.
  const updateTask = (id: number, patch: Partial<UploadTask>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const dismissTask = (id: number) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const nuevas = Array.from(files).map((file) => ({
        file,
        task: { id: nextTaskId++, name: file.name, progress: 0, done: false } as UploadTask,
      }));
      setTasks((prev) => [...prev, ...nuevas.map((n) => n.task)]);

      for (const { file, task } of nuevas) {
        try {
          const result = await uploadFileResumable(file, {
            folder,
            onProgress: (pct) => updateTask(task.id, { progress: pct, retrying: false }),
            onRetry: () => updateTask(task.id, { retrying: true }),
          });
          updateTask(task.id, { progress: 100, done: true, retrying: false });
          onUploaded(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error';
          updateTask(task.id, { error: message, done: true, retrying: false });
        }
      }

      // Las terminadas con éxito se van solas a los 3 s. Los errores NO: se
      // quedan hasta que el usuario los cierre, que para eso están ahí.
      setTimeout(() => {
        setTasks((prev) => prev.filter((t) => !t.done || t.error));
      }, 3000);
    },
    [folder, onUploaded],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      processFiles(e.target.files);
      e.target.value = '';
    }
  };

  // Arrastrar en cualquier parte de la ventana activa la zona de drop, no
  // solo al pasar por encima del botón. dragCounterRef evita que el overlay
  // parpadee: dragenter/dragleave se disparan también al pasar sobre
  // elementos hijos, así que solo se oculta cuando el contador llega a 0.
  const dragCounterRef = useRef(0);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

    const onWindowDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounterRef.current += 1;
      setDragging(true);
    };
    const onWindowDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    };
    const onWindowDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0) setDragging(false);
    };
    const onWindowDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounterRef.current = 0;
      setDragging(false);
      if (e.dataTransfer?.files.length) {
        processFiles(e.dataTransfer.files);
      }
    };

    window.addEventListener('dragenter', onWindowDragEnter);
    window.addEventListener('dragover', onWindowDragOver);
    window.addEventListener('dragleave', onWindowDragLeave);
    window.addEventListener('drop', onWindowDrop);
    return () => {
      window.removeEventListener('dragenter', onWindowDragEnter);
      window.removeEventListener('dragover', onWindowDragOver);
      window.removeEventListener('dragleave', onWindowDragLeave);
      window.removeEventListener('drop', onWindowDrop);
    };
  }, [processFiles]);

  const activeTasks = tasks.filter((t) => !t.done);
  const errorTasks = tasks.filter((t) => t.done && t.error);

  return (
    <>
      {/* Zona de drop global — visibilidad y drop reales gestionados por los
          listeners de window del efecto de arriba; este div es solo visual. */}
      {dragging && (
        <div className="drop-zone-overlay">
          <div className="drop-zone-inner">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span>Suelta los archivos aquí</span>
          </div>
        </div>
      )}

      {/* Botón principal */}
      <button
        className="upload-btn"
        onClick={() => inputRef.current?.click()}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Subir archivo
      </button>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Progreso de subidas activas */}
      {activeTasks.length > 0 && (
        <div className="upload-progress-panel">
          {activeTasks.map((t) => (
            <ProgressBar
              key={t.id}
              value={t.progress}
              label={t.retrying ? `${t.name} — sin conexión, reintentando…` : t.name}
            />
          ))}
        </div>
      )}

      {/* Errores: se quedan hasta que se cierran a mano. Van en una pila porque
          antes cada uno se posicionaba fijo en la misma esquina y el segundo
          tapaba al primero — invisible mientras se auto-cerraban solos. */}
      {errorTasks.length > 0 && (
        <div className="upload-error-stack">
          {errorTasks.map((t) => (
        <p key={t.id} className="upload-error">
          <span className="upload-error-text">{t.name}: {t.error}</span>
          <button
            type="button"
            className="upload-error-dismiss"
            onClick={() => dismissTask(t.id)}
            aria-label={`Descartar el error de ${t.name}`}
            title="Descartar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </p>
          ))}
        </div>
      )}
    </>
  );
}
