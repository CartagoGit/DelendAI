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

## Validation

Run memory plugin tests, especially redaction, TTL, corruption, and concurrency
cases.

