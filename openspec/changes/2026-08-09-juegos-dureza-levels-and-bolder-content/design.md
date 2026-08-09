## Context

The previous change (`juegos-elimination-and-spicy-content`) gave Yo Nunca and Verdad o Reto a `categoria: clasico|picante|fiesta` axis, reasoning it as a "topic/tone" filter. Real play showed that framing was wrong: the group doesn't think in topics, they think in *intensity* — "how far is this round willing to go." `picante` was already functioning as an intensity label wearing a topic-label's clothes, and `clasico` ended up meaning "the boring one" instead of "the mild one." Verdad o Reto's `nivel: estandar|sin_pareja` toggle, on the other hand, landed well — the owner explicitly asked for the same mechanism in Yo Nunca.

## Goals / Non-Goals

**Goals:**
- One clear intensity knob (`dureza`, 3 levels + a combined option) replacing the topic-label axis that wasn't doing its job.
- Every level, including the mildest, reads as content for a group of adult friends — not a "safe for kids" fallback.
- Modo SIN PAREJA available in both content-driven personal games (Yo Nunca and Verdad o Reto), same additive semantics in both.

**Non-Goals:**
- No changes to El Impostor or Trivia en vivo — this is scoped to Yo Nunca/Verdad o Reto's content model only.
- No per-level SIN PAREJA cross product beyond what already exists conceptually for Verdad o Reto (dureza × nivel, same shape, just fewer/renamed buckets) — not adding a fourth axis.
- Still no explicit sexual content, content about real people, illegal content, or non-consensual framing — the boldness increase is about honesty and lack of childishness, not about crossing into adult content. "Fuerte" is the strongest tier this app will ever have; the ceiling doesn't move, only the floor does.

## Decisions

### `dureza` replaces `categoria` as the single axis; "Mezcla" combines all three

`dureza: 'suave' | 'media' | 'fuerte'` on every Yo Nunca and Verdad o Reto item. Setup UI: a single picker with four options — Suave, Media, Fuerte, **Mezcla** (draws from all three levels combined for that session, exactly like the previous "todas" option worked for `categoria`). This is a rename-and-reframe of the exact same shuffle-bag-per-filter mechanism already in `content.ts` (`getYoNuncaBag`/`getVerdadORetoBag`) — the bag key just switches from `categoria` to `dureza` (or `mezcla`).

### What each level actually means (content-authoring contract)

- **Suave**: honest, adult-toned, mildly embarrassing or flirty-adjacent — the kind of thing you'd comfortably ask in front of someone's parent, but still entertaining, never a throwaway "have you ever forgotten your umbrella" line. Think: minor secrets, funny mishaps, light flirting-about-others.
- **Media**: genuinely a bit uncomfortable to answer honestly — real secrets, real crushes, embarrassing romantic/social history, drinking-fueled decisions. This is roughly where the old `picante`/`fiesta` content already sat.
- **Fuerte**: the most exposing/spiciest the app gets — the questions and retos that make a room go "ooooh." Still bounded by the same content-policy rules as before (no explicit sexual content, no real third parties, nothing non-consensual).

This is a genuine rewrite instruction, not a relabeling instruction: whoever authors the content should read each existing item and ask "does this actually earn its level," discarding or rewriting anything that doesn't, rather than mechanically reassigning old `clasico` items to `suave`.

### Modo SIN PAREJA extended to Yo Nunca

Yo Nunca items gain `nivel: 'estandar' | 'sin_pareja'`, same semantics as Verdad o Reto: `estandar` is safe even if some players present are a couple, `sin_pareja` is additionally unlocked bolder content assuming nobody present is dating another player. The toggle is additive in both games (superset, not a swap) — unchanged principle from the prior change, just now applied twice.

### Bucket math and volume

Yo Nunca: `dureza(3) × nivel(2)` = 6 buckets (down from Verdad o Reto's asymmetry, dureza doesn't cross with categoria anymore since categoria is gone). Verdad o Reto: `dureza(3) × tipo(2) × nivel(2)` = 12 buckets (same count as the old categoria×tipo×nivel scheme, just relabeled). Target ≥30 items/bucket for Yo Nunca (≥180 total, replacing the current 310 — expect the total count to drop somewhat since this is a genuine quality rewrite, not a volume add, though "Mezcla" mode means the effective session pool is still large) and ≥15 items/bucket for Verdad o Reto (≥180 total, similar to before).

## Risks / Trade-offs

[Risk: rewriting rather than relabeling means losing some of the previous round's authored volume] → Mitigation: intentional — the owner's complaint is about quality/tone, not quantity; a smaller pool of content that actually lands is better than a larger pool where a third of it falls flat.

[Risk: "dureza" being purely about intensity, with no topic variety left, could make sessions feel repetitive in flavor even though intensity varies] → Mitigation: accepted trade-off per the owner's explicit framing (they described wanting an intensity control, not a topic control); topic variety can be a future addition on top of dureza if it turns out to matter.
