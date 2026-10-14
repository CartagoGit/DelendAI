---
id: x00001
status: done
type: proposal
track: logs
date: 2026-06-22
kind: fix
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 1 commits referencing x00001 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 1-commit batch
shipped-in:
  - 7562d51a # feat(lint): detect duplicate proposal ids across docs/delendai/proposals

archived-on: 2026-08-24
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
