import { useState, useEffect, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import FileGrid from '../components/FileGrid';
import UploadButton from '../components/UploadButton';
import PreviewModal from '../components/PreviewModal';
import ConfirmDialog from '../components/ConfirmDialog';
import MoveModal from '../components/MoveModal';
import PermissionsModal from '../components/PermissionsModal';
import BulkActionBar from '../components/BulkActionBar';
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
  // "Sin carpeta" no es una carpeta de disco: es activeFolder=null pidiendo
  // solo los archivos de la raíz, sin bajar a las carpetas de dentro. Por eso
  // es un estado aparte y no un valor más de activeFolder.
  const [rootOnly, setRootOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<FileItem[] | null>(null);
  const [moveTargets, setMoveTargets] = useState<FileItem[] | null>(null);
  const [shareTargets, setShareTargets] = useState<ShareTarget[] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
      const data = await getFiles(activeFolder ?? undefined, rootOnly);
      setFiles(data);
    } catch (err) {
      console.error('Failed to load files', err);
    } finally {
      setLoading(false);
    }
  }, [activeFolder, rootOnly]);

  useEffect(() => { loadFolders(); }, [loadFolders]);
  useEffect(() => { loadFiles(); }, [loadFiles]);

  const handleUploaded = (file: FileItem) => {
    setFiles((prev) => prev.find((f) => f.id === file.id) ? prev : [file, ...prev]);
    loadFolders();
  };

  const clearSelection = () => setSelected(new Set());

  const toggleSelect = (file: FileItem) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(file.id)) next.delete(file.id);
      else next.add(file.id);
      return next;
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargets) return;
    const results = await Promise.allSettled(
      deleteTargets.map((f) => deleteFile(f.relativePath).then(() => f.id)),
    );
    const succeededIds = new Set(
      results.filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled').map((r) => r.value),
    );
    const failedCount = results.length - succeededIds.size;
    setFiles((prev) => prev.filter((f) => !succeededIds.has(f.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      succeededIds.forEach((id) => next.delete(id));
      return next;
    });
    setDeleteTargets(null);
    if (failedCount > 0) {
      alert(`No se han podido eliminar ${failedCount} de ${results.length} archivo(s) (sin permiso o error de red).`);
    }
  };

  const handleMove = async (targetFolder: string | null) => {
    if (!moveTargets) return;
    const results = await Promise.allSettled(
      moveTargets.map((f) => moveFile(f.relativePath, targetFolder ?? undefined).then((updated) => ({ id: f.id, updated }))),
    );
    const succeeded = results
      .filter((r): r is PromiseFulfilledResult<{ id: string; updated: FileItem }> => r.status === 'fulfilled')
      .map((r) => r.value);
    const succeededIds = new Set(succeeded.map((s) => s.id));
    const updatedById = new Map(succeeded.map((s) => [s.id, s.updated]));
    const failedCount = results.length - succeeded.length;

    // En "todos los archivos" actualizamos cada item in-place;
    // en vista de carpeta concreta se quitan si ya no pertenecen a ella.
    setFiles((prev) => {
      if (activeFolder === null) {
        return prev.map((f) => updatedById.has(f.id) ? updatedById.get(f.id)! : f);
      }
      return prev.filter((f) => !succeededIds.has(f.id));
    });
    setSelected((prev) => {
      const next = new Set(prev);
      succeededIds.forEach((id) => next.delete(id));
      return next;
    });
    setMoveTargets(null);
    if (failedCount > 0) {
      alert(`No se han podido mover ${failedCount} de ${results.length} archivo(s) (sin permiso o error de red).`);
    }
  };

  const filteredFiles = search
    ? files.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    : files;

  const headerTitle = activeFolder
    ? activeFolder.split('/').join(' / ')
    : rootOnly
      ? 'Sin carpeta'
      : 'Todos los archivos';

  const isAdmin = ((keycloak.tokenParsed as { realm_access?: { roles?: string[] } })?.realm_access?.roles ?? []).includes('admin');

  // Legado (sin owner registrado) sigue siendo movible/borrable por
  // cualquiera, como antes de la función de permisos — igual que en backend.
  const canMutate = (f: FileItem) => isAdmin || f.ownerId === undefined || f.ownerId === currentUserId;
  // Compartir un archivo legado no tendría ningún efecto (sigue visible para
  // todos igualmente), así que se excluye del lote en vez de intentarlo.
  const canShareFile = (f: FileItem) => f.ownerId !== undefined && (isAdmin || f.ownerId === currentUserId);

  return (
    <div className="storage-layout">
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}
      <Sidebar
        folders={folders}
        activeFolder={activeFolder}
        rootOnly={rootOnly}
        onSelectFolder={(folder) => { setActiveFolder(folder); setRootOnly(false); setSearch(''); clearSelection(); }}
        onSelectRoot={() => { setActiveFolder(null); setRootOnly(true); setSearch(''); clearSelection(); }}
        onFoldersChange={loadFolders}
        onShareFolder={(folder) => setShareTargets([{ type: 'folder', path: folder.path, name: folder.path.split('/').pop()! }])}
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
          onDeleteFile={(file) => setDeleteTargets([file])}
          onMoveFile={(file) => setMoveTargets([file])}
          onPreviewFile={setPreviewFile}
          onShareFile={(file) => setShareTargets([{ type: 'file', path: file.relativePath, name: file.name }])}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          selected={selected}
          onToggleSelect={toggleSelect}
          resetKey={`${activeFolder ?? ''}::${search}`}
        />
      </main>

      {selected.size > 0 && (
        <BulkActionBar
          count={selected.size}
          onShare={() => {
            const targets = filteredFiles.filter((f) => selected.has(f.id) && canShareFile(f));
            if (targets.length === 0) {
              alert('Ninguno de los archivos seleccionados se puede compartir (son de otra persona o archivos antiguos ya visibles para todos).');
              return;
            }
            setShareTargets(targets.map((f) => ({ type: 'file' as const, path: f.relativePath, name: f.name })));
          }}
          onMove={() => {
            const targets = filteredFiles.filter((f) => selected.has(f.id) && canMutate(f));
            if (targets.length === 0) {
              alert('No tienes permiso para mover ninguno de los archivos seleccionados.');
              return;
            }
            setMoveTargets(targets);
          }}
          onDelete={() => {
            const targets = filteredFiles.filter((f) => selected.has(f.id) && canMutate(f));
            if (targets.length === 0) {
              alert('No tienes permiso para eliminar ninguno de los archivos seleccionados.');
              return;
            }
            setDeleteTargets(targets);
          }}
          onCancel={clearSelection}
        />
      )}

      {previewFile && (
        <PreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      )}

      {deleteTargets && (
        <ConfirmDialog
          message={
            deleteTargets.length === 1
              ? `¿Eliminar "${deleteTargets[0].name}"? Esta acción no se puede deshacer.`
              : `¿Eliminar ${deleteTargets.length} archivos? Esta acción no se puede deshacer.`
          }
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTargets(null)}
        />
      )}

      {moveTargets && (
        <MoveModal
          files={moveTargets}
          folders={folders.map((f) => f.path)}
          onMove={handleMove}
          onCancel={() => setMoveTargets(null)}
        />
      )}

      {shareTargets && (
        <PermissionsModal
          resources={shareTargets}
          currentUserId={currentUserId}
          onClose={() => { setShareTargets(null); clearSelection(); }}
        />
      )}
    </div>
  );
}
