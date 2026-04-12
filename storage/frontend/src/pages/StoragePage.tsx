import { useState, useEffect, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import FileGrid from '../components/FileGrid';
import UploadButton from '../components/UploadButton';
import PreviewModal from '../components/PreviewModal';
import ConfirmDialog from '../components/ConfirmDialog';
import MoveModal from '../components/MoveModal';
import { getFiles, getFolders, deleteFile, moveFile } from '../services/api';
import type { FileItem } from '../types';
import './StoragePage.css';

export default function StoragePage() {
  const [folders, setFolders] = useState<string[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileItem | null>(null);
  const [moveTarget, setMoveTarget] = useState<FileItem | null>(null);

  const loadFolders = useCallback(async () => {
    try {
      const data = await getFolders();
      setFolders(data);
    } catch (err) {
      console.error('Failed to load folders', err);
    }
  }, []);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFiles(activeFolder ?? undefined);
      setFiles(data);
    } catch (err) {
      console.error('Failed to load files', err);
    } finally {
      setLoading(false);
    }
  }, [activeFolder]);

  useEffect(() => { loadFolders(); }, [loadFolders]);
  useEffect(() => { loadFiles(); }, [loadFiles]);

  const handleUploaded = (file: FileItem) => {
    setFiles((prev) => prev.find((f) => f.id === file.id) ? prev : [file, ...prev]);
    loadFolders();
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteFile(deleteTarget.relativePath);
      setFiles((prev) => prev.filter((f) => f.id !== deleteTarget.id));
    } catch (err) {
      console.error('Failed to delete file', err);
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleMove = async (targetFolder: string | null) => {
    if (!moveTarget) return;
    try {
      const updated = await moveFile(moveTarget.relativePath, targetFolder ?? undefined);
      // En "todos los archivos" actualizamos el item in-place;
      // en vista de carpeta concreta lo quitamos si ya no pertenece
      setFiles((prev) => {
        if (activeFolder === null) {
          // reemplazar con los datos actualizados
          return prev.map((f) => f.id === moveTarget.id ? updated : f);
        }
        // si la vista es una carpeta específica, quitar el archivo movido
        return prev.filter((f) => f.id !== moveTarget.id);
      });
    } catch (err) {
      console.error('Failed to move file', err);
    } finally {
      setMoveTarget(null);
    }
  };

  const filteredFiles = search
    ? files.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    : files;

  const headerTitle = activeFolder
    ? activeFolder.split('/').join(' / ')
    : 'Todos los archivos';

  return (
    <div className="storage-layout">
      <Sidebar
        folders={folders}
        activeFolder={activeFolder}
        onSelectFolder={(folder) => { setActiveFolder(folder); setSearch(''); }}
        onFoldersChange={loadFolders}
      />

      <main className="storage-main">
        <header className="storage-header">
          <h1 className="storage-section-title">{headerTitle}</h1>

          <div className="storage-header-actions">
            <div className="search-box">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                placeholder="Buscar archivos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="search-input"
              />
              {search && (
                <button className="search-clear" onClick={() => setSearch('')} title="Limpiar">×</button>
              )}
            </div>

            <UploadButton
              folder={activeFolder ?? undefined}
              onUploaded={handleUploaded}
            />
          </div>
        </header>

        {search && (
          <p className="search-results-label">
            {filteredFiles.length} resultado{filteredFiles.length !== 1 ? 's' : ''} para "{search}"
          </p>
        )}

        <FileGrid
          files={filteredFiles}
          loading={loading}
          onDeleteFile={setDeleteTarget}
          onMoveFile={setMoveTarget}
          onPreviewFile={setPreviewFile}
        />
      </main>

      {previewFile && (
        <PreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={`¿Eliminar "${deleteTarget.name}"? Esta acción no se puede deshacer.`}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {moveTarget && (
        <MoveModal
          file={moveTarget}
          folders={folders}
          onMove={handleMove}
          onCancel={() => setMoveTarget(null)}
        />
      )}
    </div>
  );
}
