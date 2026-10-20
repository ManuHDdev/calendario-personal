import { useState } from 'react';
import type { Ciudad, ResumenImportacion } from '../types';

interface Props {
  ciudades: Ciudad[];
  ciudad: string | null;
  importando: boolean;
  resumen: ResumenImportacion | null;
  error: string | null;
  onElegir: (ciudad: string) => void;
  onImportar: (ciudad: string) => void;
}

export default function CiudadBar({ ciudades, ciudad, importando, resumen, error, onElegir, onImportar }: Props) {
  const [nueva, setNueva] = useState('');

  return (
    <div className="sem-ciudades">
      {ciudades.length > 0 && (
        <select value={ciudad ?? ''} onChange={(e) => onElegir(e.target.value)} aria-label="Ciudad">
          {ciudades.map((c) => (
            <option key={c.ciudad} value={c.ciudad}>
              {c.ciudad} ({c.cruces})
            </option>
          ))}
        </select>
      )}
      <form
        className="sem-importar"
        onSubmit={(e) => {
          e.preventDefault();
          if (nueva.trim()) onImportar(nueva.trim());
        }}
      >
        <input
          type="text"
          value={nueva}
          placeholder="Importar ciudad (p. ej. Cáceres)"
          onChange={(e) => setNueva(e.target.value)}
          disabled={importando}
          aria-label="Ciudad a importar"
        />
        <button type="submit" className="sem-btn" disabled={importando || !nueva.trim()}>
          {importando ? 'Importando…' : 'Importar'}
        </button>
      </form>
      {importando && (
        <span className="sem-nota">Descargando de OpenStreetMap; puede tardar hasta un minuto.</span>
      )}
      {resumen && !importando && (
        <span className="sem-nota">
          {resumen.ciudad}: {resumen.encontrados} cruces ({resumen.nuevos} nuevos, {resumen.accesosCreados} accesos
          creados{resumen.sinAccesos ? `, ${resumen.sinAccesos} sin accesos` : ''}).
        </span>
      )}
      {error && <span className="sem-nota sem-nota--error">{error}</span>}
    </div>
  );
}
