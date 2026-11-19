import { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import BunkerLauncher from '../components/BunkerLauncher';
import ThemeToggle from '../components/ThemeToggle';
import { SIMULATORS } from '../simulators/registry';
import './AppShell.css';

export default function AppShell() {
  const { pathname } = useLocation();
  const current = SIMULATORS.find((s) => s.path === pathname);

  useEffect(() => {
    document.title = current ? `${current.title} · Simuladores` : 'Simuladores';
    window.scrollTo(0, 0);
  }, [current]);

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-header-left">
          {current ? (
            <Link to="/" className="shell-back" aria-label="Volver a todos los simuladores">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>Simuladores</span>
            </Link>
          ) : (
            <span className="shell-title">Simuladores</span>
          )}
        </div>
        <div className="shell-header-right">
          <ThemeToggle />
          <BunkerLauncher />
        </div>
      </header>
      <main className="shell-main">
        <Outlet />
      </main>
    </div>
  );
}
