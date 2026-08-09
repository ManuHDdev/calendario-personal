import { Link } from 'react-router-dom';
import AppLauncher from '../components/AppLauncher';
import ThemeToggle from '../components/ThemeToggle';
import './HubPage.css';

const PASS_AND_PLAY = [
  { to: '/impostor', icon: '🕵️', title: 'El Impostor', desc: 'Uno de vosotros no tiene la palabra.' },
  { to: '/yo-nunca', icon: '🙈', title: 'Yo Nunca', desc: 'Confesiones alrededor de la mesa.' },
  { to: '/verdad-o-reto', icon: '🎲', title: 'Verdad o Reto', desc: 'Clásico, sin excusas.' },
];

const EN_VIVO = [
  { gameType: 'impostor-live' as const, icon: '📱', title: 'El Impostor en vivo', desc: 'Cada uno con su móvil.' },
  { gameType: 'trivia-live' as const, icon: '🧠', title: 'Trivia en vivo', desc: 'Preguntas contrarreloj.' },
];

export default function HubPage() {
  return (
    <div className="juegos-page">
      <div className="juegos-header">
        <h1>🎉 Juegos</h1>
        <div className="juegos-header-right">
          <ThemeToggle />
          <AppLauncher />
        </div>
      </div>

      <section className="juegos-seccion">
        <h2>Un móvil (pasar y jugar)</h2>
        <div className="juegos-grid">
          {PASS_AND_PLAY.map((g) => (
            <Link key={g.to} to={g.to} className="juego-card">
              <span className="juego-card-icono">{g.icon}</span>
              <h3>{g.title}</h3>
              <p>{g.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="juegos-seccion">
        <h2>En vivo (cada uno con su móvil)</h2>
        <div className="juegos-grid">
          {EN_VIVO.map((g) => (
            <Link key={g.gameType} to={`/live?gameType=${g.gameType}`} className="juego-card">
              <span className="juego-card-icono">{g.icon}</span>
              <h3>{g.title}</h3>
              <p>{g.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
