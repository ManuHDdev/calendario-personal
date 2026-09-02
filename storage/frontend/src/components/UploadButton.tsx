import { useRef, useState, useCallback, useEffect } from 'react';
import { uploadFile } from '../services/api';
import type { FileItem } from '../types';
import ProgressBar from './ProgressBar';
import './UploadButton.css';

const ACCEPTED = '.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.mp4,.mov,.avi,.mkv,.webm,.pdf';

interface Props {
  folder?: string;
  onUploaded: (file: FileItem) => void;
}

interface UploadTask {
  name: string;
  progress: number;
  done: boolean;
  error?: string;
}

export default function UploadButton({ folder, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [dragging, setDragging] = useState(false);

  const updateTask = (index: number, patch: Partial<UploadTask>) => {
    setTasks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      const base = tasks.length;
      setTasks((prev) => [
        ...prev,
        ...arr.map((f) => ({ name: f.name, progress: 0, done: false })),
      ]);

      for (let i = 0; i < arr.length; i++) {
        const idx = base + i;
        try {
          const result = await uploadFile(arr[i], folder, (pct) => {
            updateTask(idx, { progress: pct });
          });
          updateTask(idx, { progress: 100, done: true });
          onUploaded(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error';
          updateTask(idx, { error: message, done: true });
        }
      }

      // Limpiar tareas completadas tras 3 s
      setTimeout(() => {
        setTasks((prev) => prev.filter((t) => !t.done || t.error));
      }, 3000);
    },
    [folder, tasks.length, onUploaded],
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
          {activeTasks.map((t, i) => (
            <ProgressBar key={i} value={t.progress} label={t.name} />
          ))}
        </div>
      )}

      {/* Errores */}
      {errorTasks.map((t, i) => (
        <p key={i} className="upload-error">
          {t.name}: {t.error}
        </p>
      ))}
    </>
  );
}
