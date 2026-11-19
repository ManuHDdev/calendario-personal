import { Link } from 'react-router-dom';
import BunkerLauncher from './BunkerLauncher';
import ThemeToggle from './ThemeToggle';

interface Props {
  title: string;
  backTo?: string;
}

export default function AppHeader({ title, backTo }: Props) {
  return (
    <header className="app-header">
      {backTo ? (
        <Link to={backTo} className="icon-btn" aria-label="Volver">
          {'←'}
        </Link>
      ) : (
        <span className="icon-btn icon-btn--spacer" />
      )}
      <h1 className="app-header__title">{title}</h1>
      <ThemeToggle />
      <BunkerLauncher />
    </header>
  );
}
