import { useRef, useState, useCallback } from 'react';
import { uploadFile } from '../services/api';
import type { FileItem } from '../types';
import ProgressBar from './ProgressBar';
import './UploadButton.css';

const ACCEPTED = '.jpg,.jpeg,.png,.gif,.webp,.heic,.mp4,.mov,.avi,.mkv,.webm,.pdf';

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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) {
      processFiles(e.dataTransfer.files);
    }
  };

  const activeTasks = tasks.filter((t) => !t.done);
  const errorTasks = tasks.filter((t) => t.done && t.error);

  return (
    <>
      {/* Zona de drop global (aparece al arrastrar sobre la ventana) */}
      {dragging && (
        <div
          className="drop-zone-overlay"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
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
        onDragOver={handleDragOver}
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
