import { useState } from 'react';
import AppLauncher from '../components/AppLauncher';
import ThemeToggle from '../components/ThemeToggle';
import SendMessageForm from '../components/SendMessageForm';
import InboxLog from '../components/InboxLog';
import './MensajeriaPage.css';

type Seccion = 'enviar' | 'inbox';

export default function MensajeriaPage() {
  const [seccion, setSeccion] = useState<Seccion>('enviar');

  return (
    <div className="mensajeria-layout">
      <header className="mensajeria-header">
        <div className="mensajeria-header-left">
          <h1 className="mensajeria-header-titulo">Mensajería</h1>
        </div>
        <div className="mensajeria-header-right">
          <ThemeToggle />
          <AppLauncher />
        </div>
      </header>

      <div className="mensajeria-body">
        <nav className="mensajeria-tabs" aria-label="Secciones">
          <button
            className={`mensajeria-tab${seccion === 'enviar' ? ' mensajeria-tab--activa' : ''}`}
            onClick={() => setSeccion('enviar')}
          >
            Enviar mensaje de prueba
          </button>
          <button
            className={`mensajeria-tab${seccion === 'inbox' ? ' mensajeria-tab--activa' : ''}`}
            onClick={() => setSeccion('inbox')}
          >
            Inbox / Log
          </button>
        </nav>

        <main className="mensajeria-contenido">
          {seccion === 'enviar' ? <SendMessageForm /> : <InboxLog />}
        </main>
      </div>
    </div>
  );
}
