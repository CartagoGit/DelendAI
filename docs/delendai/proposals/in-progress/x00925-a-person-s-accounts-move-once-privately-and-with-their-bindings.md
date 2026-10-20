---
id: x00925
title: "A person's accounts move once, privately, and with their bindings"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-20
related:
  - f00765
  - q00034
---

# x00925 — A person's accounts move once, privately, and with their bindings

## goal

The migration that moves one person's accounts out of the committed configuration (f00765) leaves three things right. The personal file is readable only by its owner. No shared provider is left bound to an account only that person has. Two starts at the same moment move each account once.

## why

An external review of f00765, pasted by the owner on 2026-10-19, found three gaps in `personal-accounts.migrator.ts`:

1. **The personal file was not private.** `writeFileAtomic` gives a new file the umask's mode (usually `0644`). The file lists profile folders and the names of credential variables of one person's logins, so on a shared machine anyone could read it.
2. **Bindings stayed behind.** A shared `providers[]` entry whose `accountId` named a moved account stayed bound to it. For every other person that provider named an account they do not have, which orchestrator-runner refuses as "not in the account registry".
3. **There was no lock.** Two agents opening the project at once each read the personal file before the other wrote it. The migration engine holds no lock of its own.

## non-goals

- Tightening a personal file the person wrote by hand. delendai sets the mode of what it writes.
- The init offer of accounts (q00034 S6).

## slices

- global_gate: type

### S1 — Private, whole and once

- **Status**: in-progress
- **Files**: `packages/core/src/lib/shared/atomic-write.ts`, `packages/core/src/lib/contracts/constants/personal-layer-schema.constant.ts`, `packages/core/src/lib/workspace-migration/migrators/personal-accounts.migrator.ts`, `packages/core/tests/src/lib/shared/atomic-write.spec.ts`, `packages/core/tests/src/lib/workspace-migration/migrators/personal-accounts.migrator.spec.ts`
- **Gate**: type
- acceptance:
  - "`writeFileAtomic` takes an optional `mode` that the file ends with, even over an existing file."
  - "The migration writes the personal file `0600` in a `0700` folder (POSIX)."
  - "A shared provider bound to a moving account loses its `accountId` in the shared file, and the person's file gains the binding `{ id, accountId }`. A binding the person already declared wins."
  - "The move runs under `withFileMutex` on the personal file (`onContention: 'wait'`) and re-reads both files inside it, so two concurrent applies move each account once."

## acceptance

- The specs of S1 pass.
