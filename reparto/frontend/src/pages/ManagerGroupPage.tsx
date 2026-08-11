import { useParams, useNavigate } from 'react-router-dom';
import keycloak, { isManager, hasAnyRepartoRole } from '../services/keycloak';
import GroupPage from './GroupPage';

/** Envoltorio del flujo de gestor: resuelve `:id` y arma el `GroupAuth` a partir del JWT de Keycloak. */
export default function ManagerGroupPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) return null;

  const manager = isManager();

  return (
    <GroupPage
      groupId={id}
      auth={{
        token: keycloak.token!,
        isManager: manager,
        isReadOnly: !manager && hasAnyRepartoRole(),
      }}
      headerExtra={
        <button className="btn-secondary reparto-back-btn" onClick={() => navigate('/')} title="Volver al listado">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      }
      onGroupDeleted={() => navigate('/')}
    />
  );
}
