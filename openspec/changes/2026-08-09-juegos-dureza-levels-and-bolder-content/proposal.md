## Why

After playing with the `clasico`/`picante`/`fiesta` categories shipped in the previous change, the owner's feedback is that the baseline content (especially `clasico`) still reads as tame/childish, and that what the group actually wants is a direct control over how bold/uncomfortable the content gets — not a topic label. They also pointed out "Modo SIN PAREJA" makes just as much sense for Yo Nunca as it already does for Verdad o Reto, since Yo Nunca prompts have the exact same couples-in-the-room consideration.

## What Changes

- **Replace the `categoria` (tema: `clasico`/`picante`/`fiesta`) axis with a `dureza` (boldness) axis** for both Yo Nunca and Verdad o Reto: `suave`, `media`, `fuerte`. This was the real thing "categoria" was standing in for — the owner wants a knob for *how uncomfortable/spicy*, not a topic filter. Setup screens let the group pick one level, or **"Mezcla"** to draw from all three combined.
- **Raise the floor across all three levels — nothing should read as childish/kids'-party content anymore**, including `suave`. `suave` means "safe to ask/do even with someone's grandmother two seats over," not "boring." Every level should feel like it's for a group of adult friends.
- **Extend "Modo SIN PAREJA" to Yo Nunca**, exactly as it already works in Verdad o Reto: off by default (couples-safe content only), on unlocks an additional, bolder tier on top of the base pool (additive, not a swap).
- Content is substantially rewritten, not just relabeled: the existing tame items are reworked or replaced so the new `suave` tier doesn't feel like a step down from `media`/`fuerte`.

## Capabilities

### Modified Capabilities
- `juegos`: Yo Nunca and Verdad o Reto's content taxonomy (`categoria` → `dureza`, `nivel` extended to Yo Nunca) and their content APIs/setup UIs.

## Impact

- `juegos/backend/src/content/yo-nunca.json`: schema changes from `{texto, categoria}` to `{texto, dureza, nivel}` — full re-authoring, not a relabel.
- `juegos/backend/src/content/verdad-o-reto.json`: schema changes from `{texto, tipo, categoria, nivel}` to `{texto, tipo, dureza, nivel}` — full re-authoring.
- `juegos/backend/src/content/loader.ts`: validation schema and volume-minimum checks updated for the new taxonomy (`dureza` enum, per-bucket minimums recalculated for the smaller bucket count).
- `juegos/backend/src/routes/content.ts`: `yo-nunca`/`verdad-o-reto` endpoints' `categoria` query param replaced with `dureza` (accepting a single level or `mezcla`); Yo Nunca gains a `sinPareja` param mirroring Verdad o Reto's.
- `juegos/frontend/src/games/yonunca/YoNunca.tsx`: category picker replaced with a dureza picker (Suave/Media/Fuerte/Mezcla), plus a new "Modo SIN PAREJA" toggle.
- `juegos/frontend/src/games/verdadoreto/VerdadOReto.tsx`: category picker replaced with the same dureza picker; existing SIN PAREJA toggle unchanged in behavior.
- No changes to El Impostor (either mode), Trivia en vivo, the AppLauncher, infra, or the access model.
