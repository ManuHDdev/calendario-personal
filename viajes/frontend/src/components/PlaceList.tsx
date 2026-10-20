import { useRef, useState } from 'react';
import { PLACE_TYPE_META, formatCost, formatDay, formatDate } from '../lib/format';
import { computeMove, computeReorder, type PlaceGroups, type ReorderRequest } from '../lib/grouping';
import type { Place } from '../types';

interface Props {
  groups: PlaceGroups;
  selectedId: string | null;
  onSelect: (id: string) => void;
  canWrite: boolean;
  onReorder: (req: ReorderRequest) => void;
  onToggleVisited: (place: Place) => void;
  onAddForDay: (date: string | null) => void;
}

export default function PlaceList({ groups, selectedId, onSelect, canWrite, onReorder, onToggleVisited, onAddForDay }: Props) {
  const dragId = useRef<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const allowDrop = (e: React.DragEvent, key: string) => {
    if (!canWrite || !dragId.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverKey(key);
  };

  const drop = (e: React.DragEvent, date: string | null, beforeId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    const id = dragId.current;
    dragId.current = null;
    setOverKey(null);
    if (!id || id === beforeId) return;
    const req = computeReorder(groups, id, date, beforeId);
    if (req) onReorder(req);
  };

  const renderItem = (p: Place, date: string | null, orderable: boolean) => {
    const meta = PLACE_TYPE_META[p.type];
    return (
      <li
        key={p.id}
        className={`place-item${p.id === selectedId ? ' place-item--selected' : ''}${p.visited ? ' place-item--visited' : ''}${overKey === p.id ? ' drop-target' : ''}`}
        draggable={canWrite && orderable}
        onDragStart={(e) => {
          dragId.current = p.id;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', p.id);
        }}
        onDragEnd={() => {
          dragId.current = null;
          setOverKey(null);
        }}
        onDragOver={(e) => orderable && allowDrop(e, p.id)}
        onDragLeave={() => setOverKey((k) => (k === p.id ? null : k))}
        onDrop={(e) => orderable && drop(e, date, p.id)}
      >
        <span className="place-dot" style={{ background: meta.color }} aria-hidden="true" />
        <button type="button" className="place-main" onClick={() => onSelect(p.id)}>
          <span className="place-name">{p.name}</span>
          <span className="place-sub">
            {p.type === 'alojamiento'
              ? [p.checkIn && formatDate(p.checkIn), p.checkOut && formatDate(p.checkOut)].filter(Boolean).join(' - ') || meta.label
              : [p.startTime, meta.label].filter(Boolean).join(' · ')}
            {p.cost != null && ` · ${formatCost(p.cost)}`}
          </span>
        </button>
        <label className="place-visited" title={p.visited ? 'Visitado' : 'Marcar como visitado'}>
          <input type="checkbox" checked={p.visited} disabled={!canWrite} onChange={() => onToggleVisited(p)} aria-label={`Visitado: ${p.name}`} />
        </label>
        {canWrite && orderable && (
          <span className="place-moves">
            <button
              type="button"
              aria-label={`Subir ${p.name}`}
              disabled={!computeMove(groups, p.id, -1)}
              onClick={() => {
                const req = computeMove(groups, p.id, -1);
                if (req) onReorder(req);
              }}
            >
              &#9650;
            </button>
            <button
              type="button"
              aria-label={`Bajar ${p.name}`}
              disabled={!computeMove(groups, p.id, 1)}
              onClick={() => {
                const req = computeMove(groups, p.id, 1);
                if (req) onReorder(req);
              }}
            >
              &#9660;
            </button>
          </span>
        )}
      </li>
    );
  };

  const header = (title: string, count: number, date: string | null | undefined, key: string) => (
    <div
      className={`group-header${overKey === key ? ' drop-target' : ''}`}
      onDragOver={(e) => date !== undefined && allowDrop(e, key)}
      onDragLeave={() => setOverKey((k) => (k === key ? null : k))}
      onDrop={(e) => date !== undefined && drop(e, date, null)}
    >
      <h4>
        {title} <span className="group-count">{count}</span>
      </h4>
      {canWrite && date !== undefined && (
        <button type="button" className="group-add" onClick={() => onAddForDay(date)} aria-label={`Añadir lugar en ${title}`}>
          +
        </button>
      )}
    </div>
  );

  const empty = groups.lodgings.length === 0 && groups.days.length === 0 && groups.pending.length === 0;

  return (
    <div className="place-list">
      {empty && <p className="empty-hint">Todavía no hay lugares. Añade el primero buscando una dirección o pulsando en el mapa.</p>}

      {groups.lodgings.length > 0 && (
        <section>
          {header('Alojamientos', groups.lodgings.length, undefined, 'lodgings')}
          <ul>{groups.lodgings.map((p) => renderItem(p, null, false))}</ul>
        </section>
      )}

      {groups.days.map((day) => (
        <section key={day.date}>
          {header(formatDay(day.date), day.places.length, day.date, `day-${day.date}`)}
          <ul>{day.places.map((p) => renderItem(p, day.date, true))}</ul>
        </section>
      ))}

      {(groups.pending.length > 0 || canWrite) && !empty && (
        <section>
          {header('Pendientes de fecha', groups.pending.length, null, 'pending')}
          <ul>{groups.pending.map((p) => renderItem(p, null, true))}</ul>
          {groups.pending.length === 0 && <p className="empty-hint">Arrastra aquí un lugar para quitarle el día.</p>}
        </section>
      )}
    </div>
  );
}
