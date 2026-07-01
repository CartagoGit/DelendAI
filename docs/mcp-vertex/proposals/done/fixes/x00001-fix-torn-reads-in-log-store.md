---
id: x00001
status: done
type: proposal
track: logs
date: 2026-06-22
kind: fix
---

# x00001 — Fix torn reads in log-store

## Goal

Ensure that `readAllFiles` in `log-store.ts` uses the `withFileMutex` to prevent torn reads when concurrent writes occur (Audit finding H5).

## Slices

- global_gate: none

### S1 — Add file mutex to log-store.ts readAllFiles
- files: plugins/logs/src/lib/log-store.ts
- gate: none
- acceptance:
  - "bun run validate"
- status: done
