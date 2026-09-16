import { useEffect, useState } from 'react';
import { getInboxEmails, getInboxLog, type CapturedEmail, type MessageLogEntry } from '../services/api';
import './InboxLog.css';

type Tab = 'emails' | 'sms' | 'call';

export default function InboxLog() {
  const [tab, setTab] = useState<Tab>('emails');
  const [emails, setEmails] = useState<CapturedEmail[]>([]);
  const [log, setLog] = useState<MessageLogEntry[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<CapturedEmail | null>(null);
  const [selectedLog, setSelectedLog] = useState<MessageLogEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'emails') {
        setEmails(await getInboxEmails());
      } else {
        setLog(await getInboxLog(tab));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedEmail(null);
    setSelectedLog(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <div className="inbox">
      <div className="inbox-tabs" role="tablist" aria-label="Bandeja">
        <button
          type="button"
          className={`inbox-tab${tab === 'emails' ? ' inbox-tab--activa' : ''}`}
          onClick={() => setTab('emails')}
        >
          Emails capturados
        </button>
        <button
          type="button"
          className={`inbox-tab${tab === 'sms' ? ' inbox-tab--activa' : ''}`}
          onClick={() => setTab('sms')}
        >
          Log de SMS
        </button>
        <button
          type="button"
          className={`inbox-tab${tab === 'call' ? ' inbox-tab--activa' : ''}`}
          onClick={() => setTab('call')}
        >
          Log de llamadas
        </button>
        <button type="button" className="inbox-refresh" onClick={load} title="Refrescar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6" />
            <path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>

      {error && <div className="inbox-error">{error}</div>}

      {loading ? (
        <div className="inbox-loading">Cargando…</div>
      ) : tab === 'emails' ? (
        <div className="inbox-layout">
          <ul className="inbox-list">
            {emails.length === 0 && <li className="inbox-empty">Sin emails capturados todavía.</li>}
            {emails.map((email) => (
              <li key={email.id}>
                <button
                  type="button"
                  className={`inbox-item${selectedEmail?.id === email.id ? ' inbox-item--activo' : ''}`}
                  onClick={() => setSelectedEmail(email)}
                >
                  <span className="inbox-item-titulo">{email.subject || '(sin asunto)'}</span>
                  <span className="inbox-item-sub">{email.to_address} · {new Date(email.received_at).toLocaleString('es-ES')}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="inbox-detail">
            {selectedEmail ? (
              <>
                <p><strong>De:</strong> {selectedEmail.from_address}</p>
                <p><strong>Para:</strong> {selectedEmail.to_address}</p>
                <p><strong>Asunto:</strong> {selectedEmail.subject}</p>
                <p><strong>Recibido:</strong> {new Date(selectedEmail.received_at).toLocaleString('es-ES')}</p>
                <pre className="inbox-detail-body">{selectedEmail.text_body}</pre>
                {selectedEmail.html_body && (
                  <div
                    className="inbox-detail-html"
                    dangerouslySetInnerHTML={{ __html: selectedEmail.html_body }}
                  />
                )}
              </>
            ) : (
              <p className="inbox-detail-vacio">Selecciona un email para ver el contenido completo (útil para copiar un código OTP).</p>
            )}
          </div>
        </div>
      ) : (
        <div className="inbox-layout">
          <ul className="inbox-list">
            {log.length === 0 && <li className="inbox-empty">Sin entradas todavía.</li>}
            {log.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={`inbox-item${selectedLog?.id === entry.id ? ' inbox-item--activo' : ''}`}
                  onClick={() => setSelectedLog(entry)}
                >
                  <span className="inbox-item-titulo">{entry.to_address}</span>
                  <span className="inbox-item-sub">
                    <span className={`inbox-badge inbox-badge--${entry.mode}`}>{entry.mode}</span>
                    {' '}{entry.status} · {new Date(entry.created_at).toLocaleString('es-ES')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="inbox-detail">
            {selectedLog ? (
              <>
                <p><strong>Para:</strong> {selectedLog.to_address}</p>
                <p><strong>De:</strong> {selectedLog.from_address ?? '—'}</p>
                <p><strong>Estado:</strong> {selectedLog.status} ({selectedLog.mode})</p>
                {selectedLog.provider_id && <p><strong>Id proveedor:</strong> {selectedLog.provider_id}</p>}
                <p><strong>Fecha:</strong> {new Date(selectedLog.created_at).toLocaleString('es-ES')}</p>
                <pre className="inbox-detail-body">{selectedLog.body}</pre>
              </>
            ) : (
              <p className="inbox-detail-vacio">Selecciona una entrada para ver el mensaje completo.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
