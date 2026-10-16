import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppLauncher from '../components/AppLauncher';
import FileIcon from '../components/FileIcon';
import LazyImage from '../components/LazyImage';
import Lightbox from '../components/Lightbox';
import MediaPlayer from '../components/MediaPlayer';
import ThemeToggle from '../components/ThemeToggle';
import {
  buildBreadcrumbs,
  filterEntries,
  formatDate,
  formatSize,
  imagesOf,
  sortEntries,
  type CategoryFilter,
  type DirEntry,
  type SortDir,
  type SortKey,
} from '../lib/files';
import { downloadUrl, fileUrl, listDir, refreshToken } from '../services/api';
import './DescargasPage.css';

type View = 'grid' | 'list';

const SORT_LABELS: Record<SortKey, string> = { date: 'Fecha', name: 'Nombre', size: 'Tamaño' };
const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: 'Todo',
  image: 'Imágenes',
  video: 'Vídeos',
  audio: 'Audio',
  pdf: 'PDF',
  text: 'Texto',
  other: 'Otros',
};

function loadPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v as T) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function savePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: preference just won't persist */
  }
}

export default function DescargasPage() {
  const [params, setParams] = useSearchParams();
  const path = (params.get('path') ?? '').replace(/^\/+/, '');

  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>(() => loadPref('descargas.sortKey', ['date', 'name', 'size'] as const, 'date'));
  const [sortDir, setSortDir] = useState<SortDir>(() => loadPref('descargas.sortDir', ['asc', 'desc'] as const, 'desc'));
  const [view, setView] = useState<View>(() => loadPref('descargas.view', ['grid', 'list'] as const, 'grid'));

  const [lightboxPath, setLightboxPath] = useState<string | null>(null);
  const [playing, setPlaying] = useState<DirEntry | null>(null);
  const [, setTick] = useState(0);

  // Keep the access token (used in media URLs) valid; the tick re-renders the
  // plain <a> links so new tabs/downloads always get a fresh URL.
  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshToken(90).then(() => setTick((t) => t + 1));
    }, 45_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setQuery('');
    setCategory('all');
    setLightboxPath(null);
    listDir(path, controller.signal)
      .then((res) => setEntries(res.entries))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setEntries([]);
        setError(err instanceof Error ? err.message : 'No se pudo cargar la carpeta');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path]);

  const visible = useMemo(
    () => sortEntries(filterEntries(entries, query, category), sortKey, sortDir),
    [entries, query, category, sortKey, sortDir],
  );
  const images = useMemo(() => imagesOf(visible), [visible]);
  const lightboxIndex = lightboxPath ? images.findIndex((i) => i.path === lightboxPath) : -1;

  const navigate = useCallback(
    (next: string) => {
      setParams(next ? { path: next } : {});
    },
    [setParams],
  );

  const changeSortKey = (key: SortKey) => {
    setSortKey(key);
    savePref('descargas.sortKey', key);
  };
  const toggleSortDir = () => {
    const next: SortDir = sortDir === 'asc' ? 'desc' : 'asc';
    setSortDir(next);
    savePref('descargas.sortDir', next);
  };
  const changeView = (next: View) => {
    setView(next);
    savePref('descargas.view', next);
  };

  const crumbs = buildBreadcrumbs(path);
  const fileCount = entries.filter((e) => e.type === 'file').length;
  const dirCount = entries.length - fileCount;

  function open(entry: DirEntry) {
    if (entry.type === 'dir') navigate(entry.path);
    else if (entry.category === 'image') setLightboxPath(entry.path);
    else if (entry.category === 'video' || entry.category === 'audio') setPlaying(entry);
  }

  function renderEntry(entry: DirEntry) {
    const kind = entry.type === 'dir' ? 'dir' : entry.category ?? 'other';
    const inApp = entry.type === 'dir' || kind === 'image' || kind === 'video' || kind === 'audio';
    // pdf/text open in a new tab (browser viewer); anything else just downloads.
    const meta =
      entry.type === 'dir' ? 'Carpeta' : `${formatSize(entry.size)} · ${formatDate(entry.mtime)}`;

    const thumb =
      kind === 'image' ? (
        <LazyImage path={entry.path} alt={entry.name} />
      ) : (
        <span className={`entry-icon entry-icon--${kind}`}>
          <FileIcon kind={kind} size={view === 'grid' ? 44 : 28} />
        </span>
      );

    const body = (
      <>
        <span className="entry-thumb">{thumb}</span>
        <span className="entry-text">
          <span className="entry-name" title={entry.name}>{entry.name}</span>
          <span className="entry-meta">{meta}</span>
        </span>
      </>
    );

    return (
      <li key={entry.path} className="entry">
        {inApp ? (
          <button className="entry-main" onClick={() => open(entry)}>
            {body}
          </button>
        ) : kind === 'pdf' || kind === 'text' ? (
          <a className="entry-main" href={fileUrl(entry.path)} target="_blank" rel="noopener noreferrer">
            {body}
          </a>
        ) : (
          <a className="entry-main" href={downloadUrl(entry.path)} download>
            {body}
          </a>
        )}
        {entry.type === 'file' && (
          <a
            className="entry-download"
            href={downloadUrl(entry.path)}
            download
            title={`Descargar ${entry.name}`}
            aria-label={`Descargar ${entry.name}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12M7 10l5 5 5-5M4 20h16" />
            </svg>
          </a>
        )}
      </li>
    );
  }

  return (
    <div className="descargas-layout">
      <header className="descargas-header">
        <h1 className="descargas-title">Descargas</h1>
        <div className="descargas-header-right">
          <ThemeToggle />
          <AppLauncher />
        </div>
      </header>

      <main className="descargas-main">
        <nav className="descargas-breadcrumb" aria-label="Ruta">
          {crumbs.map((crumb, i) => (
            <span key={crumb.path} className="crumb-item">
              {i > 0 && <span className="crumb-sep" aria-hidden="true">/</span>}
              {i === crumbs.length - 1 ? (
                <span className="crumb crumb--current" aria-current="page">{crumb.label}</span>
              ) : (
                <button className="crumb" onClick={() => navigate(crumb.path)}>{crumb.label}</button>
              )}
            </span>
          ))}
        </nav>

        <div className="descargas-toolbar">
          <input
            className="toolbar-search"
            type="search"
            placeholder="Buscar por nombre…"
            aria-label="Buscar por nombre"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="toolbar-select"
            aria-label="Filtrar por tipo"
            value={category}
            onChange={(e) => setCategory(e.target.value as CategoryFilter)}
          >
            {(Object.keys(CATEGORY_LABELS) as CategoryFilter[]).map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
          <div className="toolbar-group">
            <select
              className="toolbar-select"
              aria-label="Ordenar por"
              value={sortKey}
              onChange={(e) => changeSortKey(e.target.value as SortKey)}
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>{SORT_LABELS[k]}</option>
              ))}
            </select>
            <button
              className="toolbar-btn"
              onClick={toggleSortDir}
              title={sortDir === 'desc' ? 'Orden descendente' : 'Orden ascendente'}
              aria-label={sortDir === 'desc' ? 'Orden descendente, pulsar para invertir' : 'Orden ascendente, pulsar para invertir'}
            >
              {sortDir === 'desc' ? '↓' : '↑'}
            </button>
          </div>
          <div className="toolbar-group" role="group" aria-label="Vista">
            <button
              className={`toolbar-btn${view === 'grid' ? ' toolbar-btn--active' : ''}`}
              onClick={() => changeView('grid')}
              aria-pressed={view === 'grid'}
            >
              Cuadrícula
            </button>
            <button
              className={`toolbar-btn${view === 'list' ? ' toolbar-btn--active' : ''}`}
              onClick={() => changeView('list')}
              aria-pressed={view === 'list'}
            >
              Lista
            </button>
          </div>
        </div>

        {!loading && !error && (
          <p className="descargas-summary">
            {dirCount > 0 && `${dirCount} ${dirCount === 1 ? 'carpeta' : 'carpetas'}, `}
            {fileCount} {fileCount === 1 ? 'archivo' : 'archivos'}
            {visible.length !== entries.length && ` · mostrando ${visible.length}`}
          </p>
        )}

        {loading && <p className="descargas-state">Cargando…</p>}
        {error && (
          <div className="descargas-state descargas-state--error" role="alert">
            <p>{error}</p>
            {path && <button className="toolbar-btn" onClick={() => navigate('')}>Volver al inicio</button>}
          </div>
        )}
        {!loading && !error && entries.length === 0 && (
          <p className="descargas-state">Esta carpeta está vacía.</p>
        )}
        {!loading && !error && entries.length > 0 && visible.length === 0 && (
          <p className="descargas-state">Ningún archivo coincide con la búsqueda.</p>
        )}

        {!loading && !error && visible.length > 0 && (
          <ul className={`entries entries--${view}`}>{visible.map(renderEntry)}</ul>
        )}
      </main>

      {lightboxIndex >= 0 && (
        <Lightbox
          images={images}
          index={lightboxIndex}
          onIndexChange={(i) => setLightboxPath(images[i].path)}
          onClose={() => setLightboxPath(null)}
        />
      )}
      {playing && <MediaPlayer key={playing.path} entry={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}
