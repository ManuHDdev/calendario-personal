## Why

This monorepo (Calendario, mapacyd, Panel, Storage) was built and deployed before adopting spec-driven development. There is no OpenSpec baseline describing what the system currently does, so every future change lacks a reference point to diff against. This change establishes that baseline — it documents existing, already-deployed behavior, it does not introduce new functionality.

## What Changes

- Create baseline specs for the four capabilities that make up this monorepo, reflecting their current, already-implemented behavior.
- No code changes. No new features. This is a documentation-only change.

## Capabilities

### New Capabilities
- `calendario`: Personal calendar app (Spring Boot + Angular) — soft-deleted events with images, Keycloak-protected, single-owner model.
- `mapacyd`: Loading/unloading zone scheduler (Fastify + React) — role-gated CRUD over zones and their schedules.
- `panel`: Admin panel (Fastify + React) — user management backed entirely by the Keycloak Admin API, admin-only.
- `storage`: Personal file storage (Fastify + React) — filesystem-backed file/folder management with image thumbnails and video streaming.

### Modified Capabilities
(none — this is the first baseline, nothing existed in openspec/specs/ before it)

## Impact

Documentation only: creates `openspec/specs/calendario/spec.md`, `openspec/specs/mapacyd/spec.md`, `openspec/specs/panel/spec.md`, `openspec/specs/storage/spec.md`. No source code, infrastructure, or deployed behavior is affected.
