---
id: c00516
title: "Multi-path `withFileMutexes` primitive + close the safeRename race window"
kind: refactor
status: ready
type: proposal
track: concurrency
date: 2026-09-06
priority: P0
related:
    - c00510 # the hardening round that introduced safeRename
    - c00012 # coexistence with parallel work — the cross-process race that motivates this
    - packages/core/src/lib/shared/with-file-mutex.ts # the single-path primitive
---

# c00516 — Multi-path `withFileMutexes` primitive + close the safeRename race window

## Goal

The current `safeRename(fromAbs, toAbs)` primitive (introduced in
c00510) protects against POSIX `rename(2)` silently clobbering an
existing destination. It does NOT, however, close the **check-then-act
race** between two agents that each have their own source path and
race for the same target path:

```
Agente A                      Agente B
source-A → target            source-B → target

access(target) = no
                              access(target) = no
rename(A, target)
                              rename(B, target)        ← still clobbers A's rename
```

The fix is to hold a mutex over BOTH the source and destination paths
inside a single critical section. The current single-path primitive
`withFileMutex(path, fn)` only locks on one path, so each call site
keyed the mutex on the **source** path (the proposal-transition tool
uses `withFileMutex(found.absPath, …)`) — leaving the destination
unprotected against a concurrent writer from a different source.

This proposal introduces a **multi-path primitive**
`withFileMutexes([path1, path2, ...], fn)` that holds a single
critical section over the sorted-unique set of paths, AND migrates
the three safeRename call sites to use it. The sort-and-dedupe step
is mandatory: if two agents pick opposite orders (A locks `[src, dst]`,
B locks `[dst, src]`) the system deadlocks.

## why

The 2026-09-06 post-commit review explicitly flagged this as P0/P1:
the safeRename API correctly refuses clobber, but the consumer's
mutex coverage is still wrong. The proposal
`c00510-hardening-round-...md` itself documents the desired
behaviour in its B1 section ("call sites that need cross-process
safety MUST wrap this in `withFileMutex` keyed on the destination
path"), but the actual call sites only lock the source. Without
this fix, two concurrent `proposal_transition` operations that move
proposals into the same destination folder can race past each
other's `safeRename` checks.

## why this design

Multi-path mutex acquisition has a known anti-deadlock convention:
all callers MUST sort the path list lexicographically before
acquiring. The primitive enforces this internally so a future caller
cannot forget. Single-writer semantics across the whole set are
preserved by acquiring one path at a time, in order, under a fresh
AsyncLocalStorage reentrance guard, and only invoking `fn` once all
locks are held.

The alternative (acquire all locks atomically via a single
`flock`-style syscall) is not portable across the project's Node
+Bun + Windows surface. The serial-acquire approach matches the
existing `withFileMutex` semantics; the only new behaviour is the
multi-path fan-in.

The proposal also adds a unit test that exercises the
deadlock-avoidance property: two concurrent calls with reversed
path orderings must serialise, not deadlock.

## Tasks

### S1 — The multi-path primitive

`packages/core/src/lib/shared/with-file-mutex.ts`:

- Add `export const withFileMutexes = async <T>(paths: readonly string[], fn: () => Promise<T>, options?: IFileMutexOptions): Promise<T>`.
- The implementation:
  1. Dedupe + sort `paths` lexicographically.
  2. Acquire each in order via the existing `acquire(path, options)`
     helper. A per-`AsyncLocalStorage` reentrance guard short-circuits
     paths already held by the current call stack (so a wrapped
     function that internally calls single-path `withFileMutex` on
     one of the fan-in paths does not self-deadlock).
  3. Invoke `fn` once.
  4. Release in reverse order.

### S2 — Migrate the safeRename call sites

Three files:

- `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`:
  `moveFile` (line 680) acquires `withFileMutexes([fromAbs, toAbs], …)`.
  The legacy archival at line 406 (`reconcileAndArchiveCompleted
  RootProposals`) also acquires multi-path over
  `[sourcePath, join(historicalDir, name)]`.
- `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`:
  the `withFileMutex(found.absPath, …)` block (around line 1190)
  becomes `withFileMutexes([found.absPath, newAbsPath], …)`.
- `plugins/proposals/src/lib/tools/recovery-tools.ts`:
  the `withFileMutex(found.absPath, …)` block (around line 390)
  becomes `withFileMutexes([found.absPath, newAbsPath], …)`.

### S3 — Test the race scenario

`packages/core/tests/src/lib/shared/with-file-mutexes.spec.ts`:

- A two-writer concurrency test where two tasks each call
  `withFileMutexes` with reversed path orders and target the same
  destination file. The test pins that:
  - Exactly one `safeRename` succeeds.
  - The other raises `SafeRenameTargetExistsError`.
  - No deadlock: both tasks complete within the test timeout.
- A reentrance test that calls `withFileMutexes` with a path set
  that overlaps with a `withFileMutex` call inside `fn`. The inner
  call must short-circuit via the reentrance guard, not deadlock.

### S4 — Export the primitive

Add `withFileMutexes` (and `IFileMutexesOptions` if a distinct type
is needed) to `packages/core/src/public/index.ts`.

### S5 — Documentation

Update `safe-rename.ts`'s docstring to point callers at
`withFileMutexes` as the standard cross-process exclusion pattern.
The current wording ("call sites that need cross-process safety
MUST wrap this in `withFileMutex` keyed on the destination path")
already mentions the destination, but is ambiguous; this change
makes the canonical pairing explicit.

## Acceptance

- `withFileMutexes` exists, is exported, and reentrance-safe.
- All three `safeRename` call sites use `withFileMutexes` keyed on
  `[fromAbs, toAbs]`.
- The new two-writer test exits 0 (one `safeRename` wins, the
  other raises `SafeRenameTargetExistsError`, no deadlock).
- `bun run validate` stays green.

## Out of scope

- A general-purpose multi-host distributed lock. The cross-process
  scope is bounded by the single-machine `flock`-style lock file
  semantics already in `withFileMutex`.
- Replacing `withFileMutex` everywhere. Most existing call sites
  lock a single path and are not affected by the race this
  proposal fixes; they keep using `withFileMutex`.