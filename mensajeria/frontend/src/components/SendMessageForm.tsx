import { useState } from 'react';
import { sendMessage, type Channel, type SendMessageResult } from '../services/api';
import './SendMessageForm.css';

const CANALES: { id: Channel; label: string }[] = [
  { id: 'email', label: 'Email' },
  { id: 'sms', label: 'SMS' },
  { id: 'call', label: 'Llamada' },
];

export default function SendMessageForm() {
  const [channel, setChannel] = useState<Channel>('email');
  const [to, setTo] = useState('');
  const [from, setFrom] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendMessageResult | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    setResult(null);
    try {
      const res = await sendMessage({
        channel,
        to,
        from: from || undefined,
        subject: channel === 'email' ? subject : undefined,
        body,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar');
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="send-form" onSubmit={handleSubmit}>
      <div className="send-form-tabs" role="tablist" aria-label="Canal">
        {CANALES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={channel === c.id}
            className={`send-form-tab${channel === c.id ? ' send-form-tab--activa' : ''}`}
            onClick={() => { setChannel(c.id); setResult(null); setError(''); }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="field-group">
        <label className="field-label">Destinatario ({channel === 'email' ? 'email' : 'teléfono en formato internacional'})</label>
        <input
          className="field-input"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder={channel === 'email' ? 'destino@ejemplo.com' : '+34600000000'}
          required
        />
      </div>

      <div className="field-group">
        <label className="field-label">Remitente <span className="field-optional">(opcional, usa el de por defecto si se deja vacío)</span></label>
        <input
          className="field-input"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder={channel === 'email' ? 'mensajeria@mock.local' : '+34600000001'}
        />
      </div>

      {channel === 'email' && (
        <div className="field-group">
          <label className="field-label">Asunto</label>
          <input
            className="field-input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Tu código de verificación"
            required
          />
        </div>
      )}

      <div className="field-group">
        <label className="field-label">
          {channel === 'call' ? 'Texto a leer en la llamada' : 'Cuerpo del mensaje'}
        </label>
        <textarea
          className="field-input field-textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Contenido del mensaje de prueba…"
          rows={5}
          required
        />
      </div>

      {error && <p className="send-form-error">{error}</p>}

      {result && (
        <div className={`send-form-result send-form-result--${result.mode}`}>
          <strong>{result.mode === 'mock' ? 'Modo mock' : 'Modo real'}</strong> — estado: {result.status}
          {result.providerId && <> · id proveedor: {result.providerId}</>}
        </div>
      )}

      <button type="submit" className="send-form-submit" disabled={sending}>
        {sending ? 'Enviando…' : `Enviar ${channel === 'email' ? 'email' : channel === 'sms' ? 'SMS' : 'llamada'} de prueba`}
      </button>
    </form>
  );
}
