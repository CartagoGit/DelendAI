---
id: x01009
title: "Resetting the session balance writes nothing"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-11-03
last-transition-id: 0286ffff-4409-42df-b248-74fbef88213f
last-correlation-id: 0286ffff-4409-42df-b248-74fbef88213f
last-transition-from: in-progress
last-transition-at: 2026-11-03T11:34:21.157Z
---

# x01009 — Resetting the session balance writes nothing

## goal

Clearing the agent-lock session balance only forgets the cache; it never creates a directory, so a spec's fake workspace root cannot raise an unhandled EACCES.

## why

PR #1706 failed CI on 2026-11-03 in `tests: proposals 1/3` with no failing test. Vitest caught an unhandled rejection `EACCES: permission denied, mkdir '/ws'` from `resetSessionBalance`. That reset ran `mkdir` on the folder of the last cached session log. The specs that use the fake root `/ws` left that path in the cache, and the specs that reset call it without `await`, so the rejection escaped into whichever shard ran next. Creating the folder is the append's job (`appendSessionEntry` already does it), so the reset did a write it had no reason to do and broke unrelated PRs.

## non-goals

- Changing how the session log is written or read.

## slices

- global_gate: none

### S1 — The reset forgets, the append creates
- **Status**: review
- **Files**: `plugins/proposals/src/lib/locks/agent-lock-session-store.ts`, `plugins/proposals/tests/src/lib/locks/agent-lock-session-store.spec.ts`
- **Gate**: none
- acceptance:
  - "resetSessionBalance makes no filesystem call; a spec resets after a balance read under an unwritable root and sees no rejection, and appendSessionEntry still creates its folder."
- shipped-in: `c7406b8dfeb4`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- resetSessionBalance makes no filesystem call; a spec resets after a balance read under an unwritable root and sees no rejection, and appendSessionEntry still creates its folder.
