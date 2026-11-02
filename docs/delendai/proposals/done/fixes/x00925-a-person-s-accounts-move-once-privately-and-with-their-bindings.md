---
id: x00925
title: "A person's accounts move once, privately, and with their bindings"
kind: fix
status: done
type: proposal
track: general
date: 2026-10-20
related:
  - f00765
  - q00034
last-transition-id: 80f0d23d-133e-45cc-b6b0-e0424a723715
last-correlation-id: 80f0d23d-133e-45cc-b6b0-e0424a723715
last-transition-from: review
last-transition-at: 2026-10-23T06:33:33.143Z
shipped-in:
  - "a750c67d8d9fefb09ae3acb890826081492539eb"
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

- **Status**: done
- **Files**: `packages/core/src/lib/shared/atomic-write.ts`, `packages/core/src/lib/contracts/constants/personal-layer-schema.constant.ts`, `packages/core/src/lib/workspace-migration/migrators/personal-accounts.migrator.ts`, `packages/core/tests/src/lib/shared/atomic-write.spec.ts`, `packages/core/tests/src/lib/workspace-migration/migrators/personal-accounts.migrator.spec.ts`
- **Gate**: type
- acceptance:
  - "`writeFileAtomic` takes an optional `mode` that the file ends with, even over an existing file."
  - "The migration writes the personal file `0600` in a `0700` folder (POSIX)."
  - "A shared provider bound to a moving account loses its `accountId` in the shared file, and the person's file gains the binding `{ id, accountId }`. A binding the person already declared wins."
  - "The move runs under `withFileMutex` on the personal file (`onContention: 'wait'`) and re-reads both files inside it, so two concurrent applies move each account once."
- shipped-in: `b313e9fed369`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at a750c67d8d9f, validate exit 0, tests 17/17; acceptance 4/4: (1) packages/core/src/lib/shared/atomic-write.ts takes `options.mode` and uses it as `finalMode` (`options.mode ?? <the mode the file had, or a new file's>`), chmo… (2) personal-layer-schema.constant.ts declares PERSONAL_FILE_MODE = 0o600 and PERSONAL_DIRECTORY_MODE = 0o700; the migrator mkdir's the personal folder with PERSON… (3) The migrator now moves the binding: it collects the shared providers whose accountId is one of the moving accounts, writes them into the personal file as { id,… (4) The apply wraps the whole move in `withFileMutex(target, () => move(ctx, target), { onContention: 'wait' })`, and `move` re-reads both files inside the mutex (… — Gate `type` = `bun run typecheck` exit 0 in this worktree. Delivery commit a750c67d8d9f (merge of PR #1302, claude-opus-5-5) is the commit that touches the slice's declared files; the slice's own commit is b313e9fed369. Tests: atomic-write.spec.ts + personal-accounts.migrator.spec.ts, 17/17 under vitest (both files pass). Verified by reading the delivered diff and by running the specs. No defect found: all four acceptance criteria are met by the delivered code and pinned by a passing spec.

## acceptance

- The specs of S1 pass.
