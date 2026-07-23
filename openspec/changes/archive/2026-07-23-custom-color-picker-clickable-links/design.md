## Context

`evento-form` currently limits color selection to a fixed 12-swatch palette (`seleccionarColor(color: string)` in `evento-form.ts`, sets a plain hex string on the reactive form). `evento-detalle` renders `descripcion` as plain interpolated text with no link handling. Both fields already store what's needed (`color: varchar(7)`, `descripcion: TEXT`) — this is purely a frontend UI change.

## Goals / Non-Goals

**Goals:**
- Let the user pick any color, not just the 12 presets, via a draggable picker plus direct hex entry.
- Make URLs inside a saved event's description clickable in the read-only detail view.

**Non-Goals:**
- No backend or database changes.
- No linkification while editing (the form textarea stays plain text — only the detail view renders links).
- Not replacing the existing 12-swatch palette; the custom picker is an additional option alongside it.

## Decisions

**Color picker library: `ngx-color-picker` (not `ngx-colors`).**
Checked compatibility before deciding: `ngx-colors` tops out at Angular 15 (last published ~2 years ago) and would not install cleanly against this project's Angular 20.3. `ngx-color-picker` (zefoy) tracks Angular's major version directly — its 20.x release line targets Angular 20 — and is the most widely used, actively maintained option. Trade-off: it renders a saturation/hue **square** with a hue slider, not a literal circular wheel, but it fully satisfies "move to pick freely + type a hex code," is actively maintained, and won't break the build. If a true circular wheel turns out to matter more than compatibility once implemented, that's a follow-up change, not a blocker for this one.

**Linkification approach:** a pure Angular pipe (`linkifyPipe`) applied only in `evento-detalle`'s template via `[innerHTML]`. The pipe HTML-escapes the raw description first (to prevent XSS from arbitrary user text), then wraps `http(s)://` and `www.` matches in `<a href="..." target="_blank" rel="noopener noreferrer">`, and returns the result via `DomSanitizer.bypassSecurityTrustHtml` (safe because the pipe fully controls the HTML it generates — no unescaped user input passes through).

**Custom color entry point (revised during implementation):** `evento-form` already has a plain hex text input (`formControlName="color"`, placeholder `#0071e3`) below the swatch row — direct hex entry was already implemented, which this change's proposal had missed. Rather than adding a separate button, `ngx-color-picker`'s directive is attached directly to that existing input: clicking it opens the color-wheel panel, and manually typing a hex code continues to work exactly as before. No new UI element is added, only the existing hex input gains a picker.

## Risks / Trade-offs

[Risk: `ngx-color-picker`'s square/slider UI doesn't visually match "círculo cromático" literally] → Mitigation: functionally equivalent (free selection + hex input); documented here so it's a known, accepted trade-off rather than a surprise during review.
[Risk: naive URL regex could mis-detect or mis-truncate URLs with trailing punctuation, e.g. a URL at the end of a sentence followed by a period] → Mitigation: use a well-tested URL-matching regex and exclude common trailing punctuation (`.`, `,`, `)`) from the match.
[Risk: `[innerHTML]` usage is an XSS surface if the escaping step is wrong] → Mitigation: escape the full text first, only then inject anchor tags for regex-matched URL spans — never pass raw description text through unescaped.
