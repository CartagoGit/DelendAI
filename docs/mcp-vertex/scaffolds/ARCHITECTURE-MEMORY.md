---
applies-to: plugins/memory/store/**/*.json
---

# Architecture: memory

## Purpose

Memory stores are durable user-authored state and must never persist secrets or
corrupt partial writes.

## Required Shape

- Redact secrets before writing.
- Use atomic writes and mutexes for shared state.
- Treat corrupt files as corrupt, not empty; quarantine before recovery.
- Preserve enough metadata for TTL and quota enforcement.

## Durable vs session-only

- **Durable memory** is for facts that should survive the current slice or
  session: stable repo conventions, verified operator preferences, durable
  paths/commands, and distilled decisions that would be expensive to rediscover.
- **Session continuity** is for transient working state: open hypotheses,
  intermediate traces, per-turn exploration, and text that only helps until the
  current slice closes.
- **Never persist** raw logs, large tool payloads, copied docs, speculative
  notes, or anything whose value is only “what just happened in this turn”.

## Decision tree

1. Will this still help after the current slice or session ends?
	- No → keep it in session context only.
2. Is it already cheap to recover from docs/search/local reread?
	- Yes → prefer docs/search/reread, not durable memory.
3. Is it a distilled fact or decision rather than a raw transcript?
	- No → summarise first, then decide whether to persist.
4. Does it contain secrets or volatile detail that will stale quickly?
	- Yes → do not persist; keep it transient or redact/condense it first.

## Validation

Run memory plugin tests, especially redaction, TTL, corruption, and concurrency
cases.

