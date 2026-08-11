import { useState, useEffect, useCallback, type ReactNode } from 'react';
import ThemeToggle from '../components/ThemeToggle';
import ExpenseForm from '../components/ExpenseForm';
import ExpenseList from '../components/ExpenseList';
import BalancesView from '../components/BalancesView';
import MembersPanel from '../components/MembersPanel';
import ShareGroupPanel from '../components/ShareGroupPanel';
import {
  getGroup, listMembers, listExpenses, listCategories, getBalances, getSettlement,
  createExpense, updateExpense, deleteExpense, createMember, updateMember, deleteMember,
  deleteGroup, rotateGroupToken, ApiError,
} from '../services/api';
import type { GroupAuth, Member, Expense, Balance, Transfer, ExpenseCreateInput } from '../types';
import './GroupPage.css';

type Tab = 'gastos' | 'balances' | 'miembros' | 'compartir';

interface Props {
  groupId: string;
  auth: GroupAuth;
  /** Header extra a la derecha (p. ej. botón "Volver" del gestor, o nada en el flujo de enlace). */
  headerExtra?: ReactNode;
  onGroupDeleted?: () => void;
}

/**
 * Vista de grupo compartida entre el flujo de gestor Keycloak y el flujo de
 * miembro sin cuenta (`/reparto/g/:token`) — ambos solo difieren en qué
 * `auth.token` mandan y en qué controles de gestión ven (tasks.md 7.4).
 */
export default function GroupPage({ groupId, auth, headerExtra, onGroupDeleted }: Props) {
  const [groupName, setGroupName] = useState('');
  const [accessToken, setAccessToken] = useState<string | undefined>(undefined);
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [settlement, setSettlement] = useState<Transfer[]>([]);
  const [tab, setTab] = useState<Tab>('gastos');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const canWrite = !auth.isReadOnly;
  const canManageGroup = auth.isManager;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [group, memberList, expenseList, cats] = await Promise.all([
        getGroup(auth.token, groupId),
        listMembers(auth.token, groupId),
        listExpenses(auth.token, groupId),
        listCategories(auth.token, groupId),
      ]);
      setGroupName(group.name);
      setAccessToken(group.accessToken);
      setMembers(memberList);
      setExpenses(expenseList);
      setCategories(cats);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al cargar el grupo');
    } finally {
      setLoading(false);
    }
  }, [auth.token, groupId]);

  const loadBalances = useCallback(async () => {
    try {
      const [b, s] = await Promise.all([getBalances(auth.token, groupId), getSettlement(auth.token, groupId)]);
      setBalances(b);
      setSettlement(s);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al calcular los balances');
    }
  }, [auth.token, groupId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (tab === 'balances') void loadBalances(); }, [tab, loadBalances]);

  const handleCreateExpense = async (data: ExpenseCreateInput) => {
    await createExpense(auth.token, groupId, data);
    await load();
  };
  const handleUpdateExpense = async (expenseId: string, data: ExpenseCreateInput) => {
    await updateExpense(auth.token, groupId, expenseId, data);
    await load();
  };
  const handleDeleteExpense = async (expenseId: string) => {
    await deleteExpense(auth.token, groupId, expenseId);
    await load();
  };

  const handleAddMember = async (name: string) => {
    await createMember(auth.token, groupId, name);
    await load();
  };
  const handleRenameMember = async (memberId: string, name: string) => {
    await updateMember(auth.token, groupId, memberId, name);
    await load();
  };
  const handleRemoveMember = async (memberId: string) => {
    try {
      await deleteMember(auth.token, groupId, memberId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al eliminar el miembro');
    }
  };

  const handleRotateToken = async () => {
    const { accessToken: newToken } = await rotateGroupToken(auth.token, groupId);
    setAccessToken(newToken);
  };

  const handleDeleteGroup = async () => {
    if (!window.confirm(`¿Borrar el grupo "${groupName}"? Esta acción no se puede deshacer desde la interfaz.`)) return;
    setDeleting(true);
    try {
      await deleteGroup(auth.token, groupId);
      onGroupDeleted?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al borrar el grupo');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="fullscreen-status">
        <div className="spinner" />
        <p>Cargando grupo…</p>
      </div>
    );
  }

  return (
    <div className="reparto-layout">
      <header className="reparto-header">
        <div className="reparto-header-left">
          {headerExtra}
          <h1 className="reparto-title">{groupName || 'Grupo'}</h1>
        </div>
        <div className="reparto-header-right">
          <ThemeToggle />
          {canManageGroup && (
            <button className="btn-danger" onClick={handleDeleteGroup} disabled={deleting}>
              {deleting ? 'Borrando…' : 'Borrar grupo'}
            </button>
          )}
        </div>
      </header>

      <nav className="group-tabs">
        <button className={`group-tab${tab === 'gastos' ? ' group-tab--active' : ''}`} onClick={() => setTab('gastos')}>Gastos</button>
        <button className={`group-tab${tab === 'balances' ? ' group-tab--active' : ''}`} onClick={() => setTab('balances')}>Balances</button>
        <button className={`group-tab${tab === 'miembros' ? ' group-tab--active' : ''}`} onClick={() => setTab('miembros')}>Miembros</button>
        {canManageGroup && (
          <button className={`group-tab${tab === 'compartir' ? ' group-tab--active' : ''}`} onClick={() => setTab('compartir')}>Compartir</button>
        )}
      </nav>

      <main className="reparto-main">
        {error && <div className="reparto-error">{error}</div>}

        {tab === 'gastos' && (
          <>
            {canWrite && members.length > 0 && (
              <section className="reparto-section">
                <h2 className="reparto-section-title">Añadir gasto</h2>
                <ExpenseForm members={members} categories={categories} onSubmit={handleCreateExpense} />
              </section>
            )}
            {members.length === 0 && (
              <p className="empty-hint">Añade al menos un miembro antes de poder registrar gastos.</p>
            )}
            <section className="reparto-section">
              <h2 className="reparto-section-title">Gastos del grupo</h2>
              <ExpenseList
                expenses={expenses}
                members={members}
                categories={categories}
                canWrite={canWrite}
                onUpdate={handleUpdateExpense}
                onDelete={handleDeleteExpense}
              />
            </section>
          </>
        )}

        {tab === 'balances' && (
          <section className="reparto-section">
            <BalancesView balances={balances} settlement={settlement} loading={false} />
          </section>
        )}

        {tab === 'miembros' && (
          <section className="reparto-section">
            <MembersPanel
              members={members}
              canWrite={canWrite}
              canRemove={canManageGroup}
              onAdd={handleAddMember}
              onRename={handleRenameMember}
              onRemove={handleRemoveMember}
            />
          </section>
        )}

        {tab === 'compartir' && canManageGroup && accessToken && (
          <section className="reparto-section">
            <ShareGroupPanel accessToken={accessToken} onRotate={handleRotateToken} />
          </section>
        )}
      </main>
    </div>
  );
}
