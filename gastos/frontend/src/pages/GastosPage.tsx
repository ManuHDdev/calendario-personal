import { useState, useEffect, useCallback } from 'react';
import keycloak from '../services/keycloak';
import AppLauncher from '../components/AppLauncher';
import ExpenseForm from '../components/ExpenseForm';
import PendingReview from '../components/PendingReview';
import ExpenseList from '../components/ExpenseList';
import TotalsView from '../components/TotalsView';
import { getGastos, createGasto, updateGasto, deleteGasto, getTotales } from '../services/api';
import type { Gasto, GastoFormData, Totales } from '../types';
import './GastosPage.css';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function GastosPage() {
  const [mes, setMes] = useState(currentMonth());
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [pendientes, setPendientes] = useState<Gasto[]>([]);
  const [confirmados, setConfirmados] = useState<Gasto[]>([]);
  const [totales, setTotales] = useState<Totales | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const username = (keycloak.tokenParsed as { preferred_username?: string })?.preferred_username ?? 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [pend, conf, tot] = await Promise.all([
        getGastos({ estado: 'pendiente_revision' }),
        getGastos({ mes, estado: 'confirmado', categoria: categoriaFiltro || undefined }),
        getTotales(mes),
      ]);
      setPendientes(pend);
      setConfirmados(conf);
      setTotales(tot);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar los gastos');
    } finally {
      setLoading(false);
    }
  }, [mes, categoriaFiltro]);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async (data: GastoFormData) => {
    await createGasto(data);
    await load();
  };

  const handleConfirm = async (
    id: string,
    edits: { importe: number; fecha: string; comercio: string; categoria?: string },
  ) => {
    await updateGasto(id, { ...edits, estado: 'confirmado' });
    await load();
  };

  const handleDiscard = async (id: string) => {
    await deleteGasto(id);
    await load();
  };

  const handleDelete = async (id: string) => {
    await deleteGasto(id);
    await load();
  };

  return (
    <div className="gastos-layout">
      <header className="gastos-header">
        <div className="gastos-header-left">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e8b400" strokeWidth="1.8">
            <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
            <path d="M16 12h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-3a2 2 0 0 1 0-4z"/>
          </svg>
          <h1 className="gastos-title">Gastos</h1>
        </div>
        <div className="gastos-header-right">
          <AppLauncher />
          <span className="gastos-username">{username}</span>
          <button className="gastos-logout-btn" onClick={() => keycloak.logout()}>Salir</button>
        </div>
      </header>

      <main className="gastos-main">
        {error && <div className="gastos-error">{error}</div>}

        <section className="gastos-section">
          <h2 className="gastos-section-title">Añadir gasto</h2>
          <ExpenseForm onSubmit={handleCreate} />
        </section>

        <section className="gastos-section">
          <h2 className="gastos-section-title">
            Pendientes de revisar{pendientes.length > 0 ? ` (${pendientes.length})` : ''}
          </h2>
          <PendingReview gastos={pendientes} onConfirm={handleConfirm} onDiscard={handleDiscard} />
        </section>

        <section className="gastos-section">
          <div className="gastos-filters">
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mes" />
            <input
              type="text" placeholder="Filtrar por categoría"
              value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)}
            />
          </div>
          <TotalsView totales={totales} loading={loading} />
        </section>

        <section className="gastos-section">
          <h2 className="gastos-section-title">Gastos confirmados</h2>
          {loading ? <p className="empty-hint">Cargando…</p> : <ExpenseList gastos={confirmados} onDelete={handleDelete} />}
        </section>
      </main>
    </div>
  );
}
