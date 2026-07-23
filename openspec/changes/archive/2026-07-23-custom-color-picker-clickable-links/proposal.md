## Why

Calendario currently limits event colors to a fixed palette of 12 preset swatches, with no way to pick a custom color. Event descriptions are plain text, so URLs pasted into them are not clickable — the user has to copy and paste the link manually to navigate. Both are quality-of-life gaps in an otherwise complete feature.

## What Changes

- Add a "custom color" option alongside the existing 12 preset swatches in the event form, opening a color-wheel picker (drag to pick a hue/saturation) with a hex code input (e.g. `#123abc`) for direct entry.
- Auto-detect URLs inside an event's `descripcion` and render them as clickable links in the event detail view (read-only), opening in a new tab. The edit form's textarea remains plain text — linkification is display-only.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `calendario`: adds custom color selection (beyond the fixed palette) and clickable-link rendering for descriptions in the detail view.

## Impact

- Frontend only: `evento-form` (color control) and `evento-detalle` (description rendering) in `calendario-frontend/src/app/features/eventos/`.
- New npm dependency for the color-wheel component (chosen and justified in `design.md`).
- No backend or database changes: `color` is already a plain hex string (`Evento.color`, `varchar(7)`) and `descripcion` is already free text (`TEXT`) — both fields already support what's being displayed, only the frontend input/render behavior changes.
