---
id: b00240
title: "Rebrand delendai → DelendAI: duplicate ready copy retired after canonical closure"
kind: breaking
status: retired
type: proposal
track: general
date: 2026-09-07
priority: P0
superseded-by: b00239
related:
  - b00239
---

# b00240 — retired duplicate of b00239

> **SUPERSEDED por `b00239`.**
> Mientras este checkout seguía trabajando sobre la copia `ready/`, otro agente
> cerró la propuesta canónica en `done/breakings/b00239-...md`. Esta copia se
> retira para mantener un único id activo en el catálogo.

## goal

Retire the duplicate ready copy of `b00239` once the canonical `done/` record exists.

## why

The proposal registry must never carry two files with the same id. After the canonical `done/b00239` landed, keeping `ready/b00239` on disk only created catalog drift and blocked `sync:proposals`.

## non-goals

- Do not reopen the already completed rebrand work.
- Do not fork a second active breaking proposal from the same history.

## slices

### S1 — Retire duplicate ready copy

- **Status**: done
- **Files**: `docs/delendai/proposals/retired/b00240-rebrand-delendai-delendai-cli-unico-alias-est-conflict-safe-y-auto-migracion-idempotente-de-workspaces-legacy-duplicate.md`
- **Gate**: lint
- acceptance:
  - "Only one `b00239` remains on disk."
  - "The canonical closed record is the `done/` copy."

## acceptance

- Only one `b00239` remains on disk.
- The canonical closed record is the `done/` copy.

## notes

- Duplicate retired after concurrent closure on the canonical done path.