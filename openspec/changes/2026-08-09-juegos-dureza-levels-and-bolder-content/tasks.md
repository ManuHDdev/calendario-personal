## 1. Content: rewrite Yo Nunca to the dureza taxonomy

- [x] 1.1 Re-author `yo-nunca.json` to `{texto, dureza: 'suave'|'media'|'fuerte', nivel: 'estandar'|'sin_pareja'}` — do NOT mechanically relabel the old `categoria` field; read each existing prompt and rewrite/replace it if it doesn't earn adult-toned "suave" per design.md's per-level contract
- [x] 1.2 Target ≥30 items per `dureza` × `nivel` bucket (6 buckets, ≥180 total)
- [x] 1.3 Verify no duplicate `texto` within a bucket

## 2. Content: rewrite Verdad o Reto to the dureza taxonomy

- [x] 2.1 Re-author `verdad-o-reto.json` to `{texto, tipo: 'verdad'|'reto', dureza: 'suave'|'media'|'fuerte', nivel: 'estandar'|'sin_pareja'}`, same rewrite-not-relabel instruction as task 1.1
- [x] 2.2 Target ≥15 items per `dureza` × `tipo` × `nivel` bucket (12 buckets, ≥180 total)
- [x] 2.3 Verify no duplicate `texto` within a bucket

## 3. Backend: schema and API updates

- [x] 3.1 `content/loader.ts`: update `YoNuncaPrompt`/`VerdadORetoPrompt` interfaces and zod schemas for the new `dureza` field; update volume-minimum checks (per-bucket minimums from task 1.2/2.2, remove the old `categoria`-based checks)
- [x] 3.2 `routes/content.ts`: `getYoNuncaBag`/`getVerdadORetoBag` — replace `categoria` filtering with `dureza` filtering (`mezcla` → no filter, same pattern `normalizeCategoria` already used for `'todas'`); `GET /juegos/api/yo-nunca/prompt` gains `dureza=` and `sinPareja=` query params (mirroring Verdad o Reto's existing pattern); `GET /juegos/api/verdad-o-reto/prompt`'s `categoria=` param renamed to `dureza=`
- [x] 3.3 Unit tests: dureza-scoped draws stay within that level; `mezcla` draws from all three; Yo Nunca's new `sinPareja` toggle is additive (same assertion shape as the existing Verdad o Reto test); unknown `dureza` value returns 400

## 4. Frontend

- [x] 4.1 `YoNunca.tsx`: replace the category picker with a dureza picker (Suave/Media/Fuerte/Mezcla); add the "Modo SIN PAREJA" toggle (reuse the same component/copy pattern as `VerdadOReto.tsx`'s existing toggle)
- [x] 4.2 `VerdadOReto.tsx`: replace the category picker with the same dureza picker; SIN PAREJA toggle behavior unchanged
- [x] 4.3 `services/api.ts`: update the yo-nunca/verdad-o-reto request helpers for the renamed/added query params

## 5. Verification

- [x] 5.1 `npm run build` (backend) and `npm run build` (frontend) both compile without errors
- [x] 5.2 Backend unit tests green
- [ ] 5.3 Manual: spot-check `suave` content across both games and confirm it no longer reads as childish/throwaway
- [ ] 5.4 Manual: confirm Yo Nunca's new SIN PAREJA toggle visibly changes the pool
