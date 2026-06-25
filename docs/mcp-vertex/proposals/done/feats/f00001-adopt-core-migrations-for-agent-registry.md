---
id: f00001
status: done
type: proposal
track: proposals+core
date: 2026-06-21
closed: 2026-06-21
kind: feat
title: Adopt core migrations in the agent registry store
---

# f00013 — Adopt core migrations in the agent registry store

## Goal

Close audit M14 by making the proposals agent registry use the generic
core migration runner instead of a local ad-hoc normalizer.

## Why

The core already provides `runMigrations`/`IVersioned`, but the
`agent-registry-store` still normalizes persisted JSON through its own
`migrate()` helper. That leaves the audit technically true: the generic
migration framework exists, but one durable proposals store is not using it.

## Non-goals

- Changing the on-disk registry shape.
- Adding a new registry version before there is a real format change.
- Rewriting other stores in the same slice.

## Slices

### S1 — Registry store uses core migrations
  - **Status**: done
  - **Files**: `plugins/proposals/src/lib/shared/agent-registry-store.ts`, `plugins/proposals/tests/src/lib/shared/agent-registry-store.spec.ts`
  - **Command**: `bunx vitest run plugins/proposals/tests/src/lib/shared/agent-registry-store.spec.ts plugins/proposals/tests/src/lib/agent-names.spec.ts plugins/proposals/tests/src/lib/agents/zombie-reconcile.spec.ts`
  - **Expect**: pass

## Acceptance

- [x] `agent-registry-store` normalizes legacy/missing-version data through `runMigrations`.
- [x] Newer-than-supported registry versions fail instead of being silently accepted.
- [x] Focused proposals tests pass.
- [x] `bun run validate` is green.
