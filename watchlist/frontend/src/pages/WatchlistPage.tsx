import { useCallback, useEffect, useState } from 'react';
import keycloak from '../services/keycloak';
import AppLauncher from '../components/AppLauncher';
import ThemeToggle from '../components/ThemeToggle';
import ItemBoard from '../components/ItemBoard';
import ItemFormModal from '../components/ItemFormModal';
import { getItems, updateItem, deleteItem } from '../services/api';
import { nextEstado } from '../utils/labels';
import type { Item, Tipo } from '../types';
import './WatchlistPage.css';

export default function WatchlistPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [tipoFiltro, setTipoFiltro] = useState<Tipo | 'todos'>('todos');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  const username = (keycloak.tokenParsed as { preferred_username?: string })?.preferred_username ?? 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getItems(tipoFiltro === 'todos' ? undefined : { tipo: tipoFiltro });
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar la watchlist');
    } finally {
      setLoading(false);
    }
  }, [tipoFiltro]);

  useEffect(() => { void load(); }, [load]);

  const handleOpenCreate = () => {
    setEditingItem(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (item: Item) => {
    setEditingItem(item);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingItem(null);
  };

  const handleSaved = async () => {
    handleCloseModal();
    await load();
  };

  const handleAdvance = async (item: Item) => {
    const siguiente = nextEstado(item.estado);
    if (!siguiente) return;
    try {
      await updateItem(item.id, { estado: siguiente });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar el estado');
    }
  };

  const handleDelete = async (item: Item) => {
    try {
      await deleteItem(item.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al borrar el ítem');
    }
  };

  return (
    <div className="watchlist-layout">
      <header className="watchlist-header">
        <div className="watchlist-header-left">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64d2ff" strokeWidth="1.8">
            <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>
          </svg>
          <h1 className="watchlist-title">Watchlist</h1>
        </div>
        <div className="watchlist-header-right">
          <ThemeToggle />
          <AppLauncher />
          <span className="watchlist-username">{username}</span>
          <button className="watchlist-logout-btn" onClick={() => keycloak.logout()}>Salir</button>
        </div>
      </header>

      <main className="watchlist-main">
        {error && <div className="watchlist-error">{error}</div>}

        <div className="watchlist-toolbar">
          <button type="button" className="btn-primary" onClick={handleOpenCreate}>
            + Añadir
          </button>
        </div>

        {loading ? (
          <p className="empty-hint">Cargando…</p>
        ) : (
          <ItemBoard
            items={items}
            tipoFiltro={tipoFiltro}
            onTipoFiltroChange={setTipoFiltro}
            onEdit={handleOpenEdit}
            onAdvance={handleAdvance}
            onDelete={handleDelete}
          />
        )}
      </main>

      {modalOpen && (
        <ItemFormModal
          item={editingItem}
          defaultTipo={tipoFiltro === 'todos' ? undefined : tipoFiltro}
          onSave={handleSaved}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}
