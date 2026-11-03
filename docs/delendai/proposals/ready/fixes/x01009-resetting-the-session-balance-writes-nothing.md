---
id: x01009
title: "Resetting the session balance writes nothing"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-03
---

# x01009 — Resetting the session balance writes nothing

## goal

Clearing the agent-lock session balance only forgets the cache; it never creates a directory, so a spec's fake workspace root cannot raise an unhandled EACCES.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — The reset forgets, the append creates
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/locks/agent-lock-session-store.ts`
- **Gate**: none
- acceptance:
  - "resetSessionBalance makes no filesystem call; a spec resets after a balance read under an unwritable root and sees no rejection, and appendSessionEntry still creates its folder."

## acceptance

- resetSessionBalance makes no filesystem call; a spec resets after a balance read under an unwritable root and sees no rejection, and appendSessionEntry still creates its folder.
