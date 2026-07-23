import { useState, useEffect, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import FileGrid from '../components/FileGrid';
import UploadButton from '../components/UploadButton';
import PreviewModal from '../components/PreviewModal';
import ConfirmDialog from '../components/ConfirmDialog';
import MoveModal from '../components/MoveModal';
import PermissionsModal from '../components/PermissionsModal';
import { getFiles, getFolders, deleteFile, moveFile } from '../services/api';
import keycloak from '../services/keycloak';
import type { FileItem, FolderEntry, PermissionsResourceType } from '../types';
import './StoragePage.css';

interface ShareTarget {
  type: PermissionsResourceType;
  path: string;
  name: string;
}

export default function StoragePage() {
  const currentUserId = (keycloak.tokenParsed as { sub?: string })?.sub ?? '';
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileItem | null>(null);
  const [moveTarget, setMoveTarget] = useState<FileItem | null>(null);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  const isAdmin = ((keycloak.tokenParsed as { realm_access?: { roles?: string[] } })?.realm_access?.roles ?? []).includes('admin');

  return (
    <div className="storage-layout">
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}
      <Sidebar
        folders={folders}
        activeFolder={activeFolder}
        onSelectFolder={(folder) => { setActiveFolder(folder); setSearch(''); }}
        onFoldersChange={loadFolders}
        onShareFolder={(folder) => setShareTarget({ type: 'folder', path: folder.path, name: folder.path.split('/').pop()! })}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="storage-main">
        <header className="storage-header">
          <div className="storage-header-left">
            <button className="sidebar-toggle" onClick={() => setSidebarOpen(true)} aria-label="Abrir menú">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <h1 className="storage-section-title">{headerTitle}</h1>
          </div>

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
          onShareFile={(file) => setShareTarget({ type: 'file', path: file.relativePath, name: file.name })}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
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
          folders={folders.map((f) => f.path)}
          onMove={handleMove}
          onCancel={() => setMoveTarget(null)}
        />
      )}

      {shareTarget && (
        <PermissionsModal
          resourceType={shareTarget.type}
          resourcePath={shareTarget.path}
          resourceName={shareTarget.name}
          currentUserId={currentUserId}
          onClose={() => setShareTarget(null)}
        />
      )}
    </div>
  );
}
