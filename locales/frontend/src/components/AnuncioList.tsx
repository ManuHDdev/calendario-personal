import type { Anuncio } from '../types';
import AnuncioCard from './AnuncioCard';

interface Props {
  anuncios: Anuncio[];
  ultimoRastreoError?: string | null;
  onMarcarVisto: (id: number) => void;
  onDescartar: (id: number) => void;
}

export default function AnuncioList({ anuncios, ultimoRastreoError, onMarcarVisto, onDescartar }: Props) {
  return (
    <>
      {ultimoRastreoError && (
        <p className="feed-alerta">⚠ Último rastreo incompleto — {ultimoRastreoError}</p>
      )}
      {anuncios.length === 0 ? (
        <p className="empty-hint">
          Nada por aquí. Si acabas de crear una búsqueda, pulsa «Rastrear ahora» para la primera pasada.
        </p>
      ) : (
        <ul className="anuncio-grid">
          {anuncios.map((a) => (
            <AnuncioCard key={a.id} anuncio={a} onMarcarVisto={onMarcarVisto} onDescartar={onDescartar} />
          ))}
        </ul>
      )}
    </>
  );
}
