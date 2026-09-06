---
id: c00517
title: "`safeListDirRequired` for fail-closed consumers + `lint:no-discarded-safe-list-error`"
kind: refactor
status: ready
type: proposal
track: observability
date: 2026-09-06
priority: P1
related:
    - c00510 # the hardening round that introduced safeListDir
    - c00519 # quarantine table — the place where readFailed events land for the reconciliador
    - c00514 # purity lint — the new persistence boundary this proposal enforces
    - q00018 # state-engine Phase 2 / Phase 5 — the consumers this affects
---

# c00517 — `safeListDirRequired` for fail-closed consumers + `lint:no-discarded-safe-list-error`

## Goal

`safeListDir` (introduced in c00510) distinguishes "directory empty"
from "directory missing" from "read failure". The primitive is
correct, but most call sites do `(await safeListDir(x)).entries`
and **discard** the rest of the shape. The 2026-09-06 post-commit
review (c00510 retro) flagged this as the single biggest remaining
gap before SQLite: a reconciliador that discards `readFailed` is
no better than the old `.catch(() => [])`.

This proposal:

1. Adds a second API `safeListDirRequired` whose contract is
   **fail-closed**: ENOENT (legitimate empty), empty directory
   (legitimate empty), or a thrown `SafeListDirReadFailed` error
   with the original cause attached. There is no "silent empty"
   option.
2. Adds a lint script `tools/scripts/lint/no-discarded-safe-list-error.script.ts`
   that flags any expression of the form
   `(await safeListDir(...)).entries` in
   `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`
   and the SQLite-shadow harness paths (Phase 1 of q00019). The
   lint allows the new `safeListDirRequired` form, the destructured
   `{ entries, readFailed, reason, error }` form, and the
   `emptySafeListDirResult` mock-helper form.
3. Migrates every the proposals reconciliador call site to the new
   contract.

## why

The user's stated invariant ("SQLite FAIL-CLOSED, no filesystem
fallback") has a direct corollary at the read-API level: a
reconciliador must never publish a generation whose inputs include
an unverified subtree. The current `(await safeListDir(...)).entries`
shape lets the reconciliador publish a generation built on
"directory exists but EACCES blocked the read" — exactly the kind
of silent partial publication the user wants to make impossible.

The lint is the structural gate that closes the regression class
once and for all. The companion primitive gives callers a clean
way to handle the failure without forcing every site to add a
`try/catch`.

## why this design

Two primitives, not one:

- `safeListDir` keeps its current happy-path / tagged-shape contract
  for the **read-only** callers (proposal-document text readers,
  log tailers, watchdogs) that genuinely want "I don't care why
  the directory is missing, just give me whatever is there".
- `safeListDirRequired` is the **fail-closed** contract for the
  writers / reconciliadors that build durable state. ENOENT is
  still allowed (the optional cache directory may not exist on a
  fresh install), but EACCES / EIO / EMFILE throw with the original
  cause.

The lint is regex-based: a `(await safeListDir(...)).entries`
expression is the canonical "I'm throwing away the failure shape"
pattern. The exception list is narrow on purpose: only the
reconciliador surface and the SQLite-shadow harness paths need to
comply in this slice; everything else is opt-in (but the lint is
the prompt to migrate them).

## Tasks

### S1 — The fail-closed primitive

`packages/core/src/lib/shared/safe-list-dir.ts`:

```ts
export class SafeListDirReadFailed extends Error {
  override readonly name = 'SafeListDirReadFailed';
  constructor(
    readonly absDir: string,
    readonly cause: unknown,
    readonly reason: 'not-a-directory' | 'read-failed',
  ) {
    super(`safeListDirRequired: failed to read ${absDir} (${reason})`, { cause });
  }
}

export const safeListDirRequired = async (
  absDir: string,
): Promise<readonly TSafeListDirEntry[]> => {
  const result = await safeListDir(absDir);
  if (result.readFailed) {
    throw new SafeListDirReadFailed(absDir, result.error, result.reason as 'not-a-directory' | 'read-failed');
  }
  return result.entries;
};
```

Export the new helper and the error class via
`packages/core/src/public/index.ts`.

### S2 — Migrate the reconciliador

In `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`:

- `scanSubtree` (line ~280) — currently
  `try { readdir } catch { return empty }`. Migrate to
  `safeListDirRequired` + a catch that surfaces the failure as a
  warning (rather than silently empty).
- `scanNewSystemFiles` (line ~519) — already migrated to
  `safeListDir(...).entries`; switch to `safeListDirRequired` and
  let `SafeListDirReadFailed` propagate up to the caller.
- `scanAllProposalIds` (line ~614) — same.
- `reconcileAndArchiveCompletedRootProposals` — the legacy
  `pNNN` archival walker has its own `try { readdir } catch`
  pattern; migrate.

The reconciliador's outer `syncProposalRegistry` catches
`SafeListDirReadFailed` and translates it into a structured
`{ ok: false, reason: 'directory-read-failed', context: { absDir,
error } }` so the operator (and `state_health`) can see exactly
which subtree failed.

### S3 — The lint

`tools/scripts/lint/no-discarded-safe-list-error.script.ts`:

- Walk every `.ts` file under
  `plugins/proposals/src/lib/proposals/` and `plugins/proposals/src/lib/state/`
  (when the latter exists — q00018 Phase 5).
- For each file, grep for the pattern
  `(await safeListDir(...)).entries` (and variants like
  `await safeListDir(x).then((r) => r.entries)`).
- Flag every match.
- Allow:
  - The destructured `{ entries, readFailed, reason, error }` form.
  - `safeListDirRequired` direct destructuring.
  - `emptySafeListDirResult` calls (mock fixtures).
- Exit 1 on any flag.
- Wire into `bun run validate`.

### S4 — Tests

- `packages/core/tests/src/lib/shared/safe-list-dir-required.spec.ts`:
  happy path, ENOENT (returns []), EACCES (throws with original
  cause attached).
- `tools/scripts/lint/no-discarded-safe-list-error.script.spec.ts`:
  the lint exits 1 on a synthetic fixture with
  `(await safeListDir(x)).entries` and exits 0 on a fixture with
  the destructured form.

### S5 — Update the proposal c00510 retro note

Append to the c00510 retro section: "c00517 closed the
`(await safeListDir(x)).entries` gap that the reviewer flagged on
2026-09-06."

## Acceptance

- `safeListDirRequired` exists, is exported, and throws
  `SafeListDirReadFailed` on read failures.
- The four reconciliador call sites use `safeListDirRequired` (or
  destructured `safeListDir`) — none silently discards
  `readFailed`.
- The lint exists, exits 0 on the current surface, and exits 1 on
  the synthetic fixture.
- `bun run validate` stays green.

## Out of scope

- Migrating the read-only consumers (proposal text readers, log
  tailers). Those use `safeListDir` legitimately and are
  untouched.
- The `quarantine` table for non-canonical filename / frontmatter
  — that is c00519.
- The SQLite shadow harness path. That lands in q00019 S3 once
  the SQLite package exists; this proposal provides the lint and
  the primitive so the harness can adopt them.