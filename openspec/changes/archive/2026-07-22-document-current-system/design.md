## Context

The four apps in this monorepo (Calendario, mapacyd, Panel, Storage) are already implemented and deployed on the production VPS. This change does not introduce architecture — it records the architecture that already exists, as verified against the current source code, so future changes have a spec baseline to diff against.

## Goals / Non-Goals

**Goals:**
- Capture the current, verified behavior of each capability as OpenSpec requirements.

**Non-Goals:**
- No new functionality, refactor, or migration. Nothing here should change deployed behavior.
- Does not resolve the known technical debt tracked in the project's CLAUDE.md (missing tests on Panel/Storage/mapacyd, duplicated JWT middleware) — those remain tracked there, not as design decisions of this change.

## Decisions

No new technical decisions were made. Architecture, stack, and conventions per app are documented in the project's `CLAUDE.md` and are treated as the source of truth alongside the spec files created by this change.

## Risks / Trade-offs

[Risk: baseline specs could drift from code over time, same as any documentation] → Mitigation: future changes to these capabilities should go through the normal OpenSpec propose → spec → apply cycle, keeping `openspec/specs/` in sync with each change.
