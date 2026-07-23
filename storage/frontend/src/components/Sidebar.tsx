import { useState, useEffect, useRef } from 'react';
import { createFolder, deleteFolder, renameFolder } from '../services/api';
import keycloak from '../services/keycloak';
import AppLauncher from './AppLauncher';
import './Sidebar.css';

interface Props {
  folders: string[];
  activeFolder: string | null;
  onSelectFolder: (folder: string | null) => void;
  onFoldersChange: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
}

function buildTree(paths: string[]): FolderNode[] {
  const map = new Map<string, FolderNode>();
  const roots: FolderNode[] = [];

  for (const p of [...paths].sort()) {
    const segments = p.split('/');
    const name = segments[segments.length - 1];
    const node: FolderNode = { name, path: p, children: [] };
    map.set(p, node);
    if (segments.length === 1) {
      roots.push(node);
    } else {
      const parentPath = segments.slice(0, -1).join('/');
      const parent = map.get(parentPath);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  }
  return roots;
}

export default function Sidebar({ folders, activeFolder, onSelectFolder, onFoldersChange, isOpen, onClose }: Props) {
  const username = (keycloak.tokenParsed as { preferred_username?: string })?.preferred_username ?? '';
  const isAdmin = ((keycloak.tokenParsed as { realm_access?: { roles?: string[] } })?.realm_access?.roles ?? []).includes('admin');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');
  const [creatingUnder, setCreatingUnder] = useState<string | null>(null); // null = root
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderError, setNewFolderError] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Expandir automáticamente la carpeta activa y sus padres
  useEffect(() => {
    if (!activeFolder) return;
    const parts = activeFolder.split('/');
    setExpanded((prev) => {
      const next = new Set(prev);
      for (let i = 1; i < parts.length; i++) {
        next.add(parts.slice(0, i).join('/'));
      }
      return next;
    });
  }, [activeFolder]);

  // Cancelar delete al hacer click fuera
  useEffect(() => {
    if (!deletingFolder) return;
    const handler = () => setDeletingFolder(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [deletingFolder]);

  const toggleExpand = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleDeleteClick = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    if (deletingFolder === path) return; // ya está en estado confirm, no hacer nada
    setDeletingFolder(path);
  };

  const handleDeleteCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingFolder(null);
  };

  const handleDeleteConfirm = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    try {
      await deleteFolder(path);
      if (activeFolder === path || activeFolder?.startsWith(path + '/')) {
        onSelectFolder(null);
      }
      onFoldersChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo eliminar la carpeta');
    } finally {
      setDeletingFolder(null);
    }
  };

  const startRename = (e: React.MouseEvent, node: FolderNode) => {
    e.stopPropagation();
    setRenamingFolder(node.path);
    setRenameValue(node.name);
    setRenameError('');
    setTimeout(() => renameInputRef.current?.select(), 30);
  };

  const handleRenameConfirm = async (path: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    try {
      const newPath = await renameFolder(path, trimmed);
      if (activeFolder === path) onSelectFolder(newPath);
      onFoldersChange();
      setRenamingFolder(null);
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Error al renombrar');
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, path: string) => {
    if (e.key === 'Enter') handleRenameConfirm(path);
    if (e.key === 'Escape') setRenamingFolder(null);
  };

  const openNewFolder = (e: React.MouseEvent, parentPath: string | null) => {
    e.stopPropagation();
    const key = parentPath === null ? '' : parentPath;
    setCreatingUnder(key);
    setNewFolderName('');
    setNewFolderError('');
    // Auto-expand the parent so the inline form becomes visible
    if (parentPath) {
      setExpanded((prev) => new Set(prev).add(parentPath));
    }
  };

  const handleCreateFolder = async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    const fullPath = creatingUnder ? `${creatingUnder}/${trimmed}` : trimmed;
    try {
      await createFolder(fullPath);
      if (creatingUnder) {
        setExpanded((prev) => new Set(prev).add(creatingUnder));
      }
      onFoldersChange();
      setCreatingUnder(null);
    } catch (err) {
      setNewFolderError(err instanceof Error ? err.message : 'Error al crear');
    }
  };

  const tree = buildTree(folders);

  const renderNode = (node: FolderNode, depth: number): React.ReactNode => {
    const isActive = activeFolder === node.path;
    const isExpanded = expanded.has(node.path);
    const isDeleting = deletingFolder === node.path;
    const isRenaming = renamingFolder === node.path;
    const hasChildren = node.children.length > 0;
    const indent = depth * 16;

    return (
      <div key={node.path} className="folder-group">
        <div
          className={`folder-row ${isActive ? 'active' : ''} ${isDeleting ? 'deleting' : ''}`}
          style={{ paddingLeft: `${10 + indent}px` }}
        >
          {/* Chevron expand/collapse */}
          <button
            className={`folder-chevron ${hasChildren ? '' : 'invisible'}`}
            onClick={(e) => hasChildren && toggleExpand(node.path, e)}
            tabIndex={-1}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 150ms ease' }}>
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>

          {/* Nombre o input de rename */}
          {isRenaming ? (
            <div className="folder-rename-wrap" onClick={(e) => e.stopPropagation()}>
              <input
                ref={renameInputRef}
                className="folder-rename-input"
                value={renameValue}
                onChange={(e) => { setRenameValue(e.target.value); setRenameError(''); }}
                onKeyDown={(e) => handleRenameKeyDown(e, node.path)}
                autoFocus
              />
              {renameError && <span className="folder-rename-error">{renameError}</span>}
              <button className="folder-rename-ok" onClick={() => handleRenameConfirm(node.path)}>✓</button>
              <button className="folder-rename-cancel" onClick={() => setRenamingFolder(null)}>✕</button>
            </div>
          ) : (
            <button
              className="folder-label"
              onClick={() => { onSelectFolder(node.path); onClose?.(); if (hasChildren) setExpanded((p) => new Set(p).add(node.path)); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24"
                fill={isActive ? 'var(--accent)' : 'none'}
                stroke={isActive ? 'var(--accent)' : 'var(--text-secondary)'}
                strokeWidth="1.8" style={{ flexShrink: 0 }}>
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              </svg>
              <span className="folder-label-text">{node.name}</span>
            </button>
          )}

          {/* Botones de acción (visibles en hover o en estado activo) */}
          {!isRenaming && (
            <div className="folder-actions" onClick={(e) => e.stopPropagation()}>
              {isDeleting ? (
                <>
                  <button className="folder-action-confirm" title="Confirmar eliminación"
                    onClick={(e) => handleDeleteConfirm(e, node.path)}>✓</button>
                  <button className="folder-action-cancel" title="Cancelar"
                    onClick={handleDeleteCancel}>✕</button>
                </>
              ) : (
                <>
                  <button className="folder-action-btn" title="Nueva subcarpeta"
                    onClick={(e) => openNewFolder(e, node.path)}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                  </button>
                  <button className="folder-action-btn" title="Renombrar"
                    onClick={(e) => startRename(e, node)}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button className="folder-action-btn folder-action-delete" title="Eliminar"
                    onClick={(e) => handleDeleteClick(e, node.path)}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14H6L5 6"/>
                      <path d="M9 6V4h6v2"/>
                    </svg>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Subcarpetas + formulario nueva subcarpeta */}
        {isExpanded && (
          <div className="folder-children">
            {node.children.map((child) => renderNode(child, depth + 1))}
            {creatingUnder === node.path && (
              <NewFolderInline
                depth={depth + 1}
                value={newFolderName}
                error={newFolderError}
                onChange={(v) => { setNewFolderName(v); setNewFolderError(''); }}
                onConfirm={handleCreateFolder}
                onCancel={() => setCreatingUnder(null)}
              />
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className={`sidebar${isOpen ? ' sidebar--open' : ''}`}>
      <div className="sidebar-header">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        </svg>
        <span className="sidebar-title">Storage</span>
      </div>

      <nav className="sidebar-nav">
        <button
          className={`sidebar-all ${activeFolder === null ? 'active' : ''}`}
          onClick={() => { onSelectFolder(null); onClose?.(); }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke={activeFolder === null ? 'var(--accent)' : 'var(--text-secondary)'} strokeWidth="1.8">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          <span>Todos los archivos</span>
        </button>

        {folders.length > 0 && <div className="sidebar-section-label">Carpetas</div>}

        {tree.map((node) => renderNode(node, 0))}
      </nav>

      <div className="sidebar-footer">
        {creatingUnder === '' ? (
          <NewFolderInline
            depth={0}
            value={newFolderName}
            error={newFolderError}
            onChange={(v) => { setNewFolderName(v); setNewFolderError(''); }}
            onConfirm={handleCreateFolder}
            onCancel={() => setCreatingUnder(null)}
          />
        ) : (
          <button className="sidebar-new-folder-btn" onClick={(e) => openNewFolder(e, null)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Nueva carpeta
          </button>
        )}

        <div className="sidebar-user">
          <div className="sidebar-user-info">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
            <span className="sidebar-username">{username}</span>
          </div>
          <div className="sidebar-user-actions">
            <AppLauncher upward />
            {isAdmin && (
              <a href="/panel/" className="sidebar-admin-btn" title="Panel de administración">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </a>
            )}
            <button className="sidebar-logout-btn" title="Cerrar sesión" onClick={() => keycloak.logout()}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

// Sub-componente inline para crear carpeta
function NewFolderInline({
  depth, value, error, onChange, onConfirm, onCancel,
}: {
  depth: number;
  value: string;
  error: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="new-folder-inline" style={{ paddingLeft: `${10 + depth * 16 + 20}px` }}>
      <input
        className="new-folder-input"
        autoFocus
        placeholder="Nombre…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onConfirm();
          if (e.key === 'Escape') onCancel();
        }}
      />
      {error && <p className="new-folder-error">{error}</p>}
      <div className="new-folder-btns">
        <button className="btn-cancel-sm" onClick={onCancel}>Cancelar</button>
        <button className="btn-create-sm" onClick={onConfirm}>Crear</button>
      </div>
    </div>
  );
}
