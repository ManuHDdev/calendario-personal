## Implemented
- [x] Backend: schema (`init.sql` + `ensureSchema.ts`), cities + haversine, DGT parser, importer + scheduler
- [x] Backend: routes (list, create, patch, soft delete, image proxy, status, manual import), Zod schemas
- [x] Backend: SSRF guard + cached image proxy
- [x] Backend tests (vitest): parser, cities, URL safety, cache, queries, schemas, routes, scheduler
- [x] Frontend: map, grid, detail, form, status banner, favourites, search, dark mode
- [x] Frontend tests for the pure logic in `lib/`
- [x] Infra: compose (local/prod), nginx blocks, CI/CD workflow, Dockerfiles
- [x] AppLauncher entry in the 18 internal copies
- [x] CLAUDE.md section, ports table, role note

## Pending (needs internet access / the VPS)
- [ ] Run `cd camaras/backend && npm run smoke -- --imagenes` against the real DGT feed and adjust
      `services/dgtParser.ts` if it recognises 0 cameras or misses names/roads
- [ ] Provision `/home/manu/camaras/.env` on the VPS (`CAMARAS_DB_NAME/USER/PASSWORD`,
      `KEYCLOAK_CERTS_URL`, `CORS_ORIGIN`) before the first deploy
- [ ] Add manual webcams for Cáceres / Mérida / Badajoz / Villanueva de la Serena if any are found
- [ ] Add the `camaras` entry to the 3 external AppLauncher copies (crypto-trader, football-predictor,
      tennis-predictor)
