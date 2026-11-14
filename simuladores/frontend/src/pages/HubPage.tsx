import { Link } from 'react-router-dom';
import { SIMULATORS } from '../simulators/registry';
import Thumbnail from './Thumbnails';
import './HubPage.css';

export default function HubPage() {
  return (
    <div className="hub">
      <header className="hub-head">
        <h1>Simuladores</h1>
        <p>
          Matemáticas y física que se ven moverse. Cada simulador anima un fenómeno, deja tocar sus parámetros y
          muestra cómo la teoría aparece sola a medida que se acumulan los experimentos.
        </p>
      </header>
      <ul className="hub-grid">
        {SIMULATORS.map((s) => (
          <li key={s.id}>
            <Link to={s.path} className="hub-card">
              <div className="hub-thumb">
                <Thumbnail id={s.id} />
              </div>
              <div className="hub-card-body">
                <span className="hub-cat">{s.category}</span>
                <h2>{s.title}</h2>
                <p>{s.summary}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
