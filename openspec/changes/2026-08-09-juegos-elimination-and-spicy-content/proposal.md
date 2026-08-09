## Why

After the group's first sessions with `juegos` (deployed in `add-juegos-app`), the owner came back with concrete gameplay feedback: El Impostor's one-shot reveal is too shallow compared to how the group actually plays it (elimination rounds, multiple impostors, named players instead of "Jugador 1/2/3"), and Yo Nunca / Verdad o Reto are too generic — the group wants category choice and content with real "salseo" (spicy, flirty, secret-revealing content), plus a couples-aware toggle for Verdad o Reto so retos can go further when nobody present is dating another player in the room.

## What Changes

- **El Impostor (both pass-and-play and live)**: replace the one-round reveal with a multi-round elimination loop. After each discussion, the most-voted player is eliminated (not revealed as impostor-or-not individually); the game continues round after round until either all impostors have been eliminated (crew wins immediately) or exactly 3 players remain (final reveal — impostors win if still among them). Setup now supports **naming every player** (even in pass-and-play) and **choosing how many impostors** play (1 to `floor((playerCount-1)/2)`), with a new minimum of 4 players so at least one elimination round is possible before reaching 3.
- **Yo Nunca**: add category selection (`clasico`, `picante`, `fiesta`) before starting, mirroring the pattern El Impostor's word bank already uses for category-scoped shuffle-bags. Expand the content bank with a real "picante" category — flirty, secret-revealing, embarrassing-but-fun prompts — not just the existing tame "clásico" set.
- **Verdad o Reto**: same category selection as Yo Nunca, plus a new **"Modo SIN PAREJA"** toggle. Off (default): only content safe to do/ask even if some players present are dating each other. On: additionally unlocks a bolder tier of prompts not shown by default. The toggle adds content, it doesn't replace the safe tier.
- **Live mode**: only El Impostor en vivo gets the elimination/multi-impostor upgrade (mirroring the pass-and-play changes) — Yo Nunca and Verdad o Reto stay pass-and-play only in this change; player naming isn't needed live since the Keycloak display name already identifies each player.
- Content authored for `picante`/`sin_pareja` tiers stays within the bounds of a private, consenting-adults friend-group game: flirty, embarrassing, secret-revealing, or drinking/party-themed. Nothing explicit, nothing depicting or instructing real sexual acts, nothing targeting a specific real person outside the game, nothing illegal or non-consensual in framing.

## Capabilities

### Modified Capabilities
- `juegos`: El Impostor's round structure (elimination loop, multi-impostor, named players), Yo Nunca and Verdad o Reto's content model (categories, tiers) and their content APIs.

### New Capabilities
(none — this extends the existing `juegos` capability, no new subapp surface)

## Impact

- `juegos/backend/src/games/impostorGame.ts` and `impostorLive.ts`: round/elimination state machine rewritten (was single-round assign→reveal, becomes assign→discuss→vote→eliminate→check-end→loop).
- `juegos/backend/src/routes/content.ts`: `yo-nunca` and `verdad-o-reto` endpoints gain `categoria` (and `sinPareja` for verdad-o-reto) query params and per-category/tier shuffle-bags, mirroring the existing `impostorBags` pattern.
- `juegos/backend/src/content/yo-nunca.json` and `verdad-o-reto.json`: schema changes (add `categoria` to both, add `nivel` to verdad-o-reto) and substantially expanded content.
- `juegos/backend/src/rooms/impostorLive.ts` (and the room/WS message contract): new message types for player-name-agnostic (live already has names) elimination rounds and multi-impostor role assignment.
- `juegos/frontend/src/games/impostor/PassAndPlayImpostor.tsx`: new setup steps (names, impostor count), new round/elimination UI, final reveal screen.
- `juegos/frontend/src/games/live/ImpostorLive.tsx`: same round/elimination UI adapted for the live room flow.
- `juegos/frontend/src/games/yonunca/YoNunca.tsx` and `verdadoreto/VerdadOReto.tsx`: category picker (+ "Modo SIN PAREJA" toggle for Verdad o Reto) added to setup.
- No changes to any other subapp, to the AppLauncher, to infra/nginx/Keycloak, or to the `juegos` access model (still any authenticated role).
