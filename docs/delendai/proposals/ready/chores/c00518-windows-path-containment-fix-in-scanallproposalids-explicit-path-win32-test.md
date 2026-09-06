---
id: c00518
title: "Windows path containment fix in `scanAllProposalIds` + explicit `path.win32` test"
kind: fix
status: ready
type: proposal
track: portability
date: 2026-09-06
priority: P1
related:
    - c00510 # parent hardening round
    - c00517 # `safeListDirRequired` — the fail-closed primitive that replaces the broken scan
    - packages/core/src/lib/shared/contain-path.ts # the canonical containment helper
---

# c00518 — Windows path containment fix in `scanAllProposalIds` + explicit `path.win32` test

## Goal

`scanAllProposalIds` in
`plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`
contains a Windows-incompatible containment check:

```ts
if (childAbs.startsWith(`${proposalsDirAbs}/`)) {
  queue.push(childAbs);
}
```

This pattern silently fails on Windows because `path.join` returns
`C:\…\proposals\done` while the check expects `C:/…/proposals/done/`.
The 2026-09-06 audit flagged this as P1/P2 ("bug real y concreto");
the post-commit review confirmed it is **still present** in HEAD.

The same anti-pattern exists in two other sites:

- `plugins/proposals/src/lib/proposals/proposal-paths.ts:64`
  (`proposalFolderOf`).
- `plugins/proposals/src/lib/tools/continue-proposal.tool.ts:220`
  (`folderOf`).

This proposal fixes all three sites with the canonical
`relative()`-based containment check, AND adds a regression test
that runs the scan with `path.win32` to pin the fix.

## why

The user's invariant is "SQLite FAIL-CLOSED" — that goal is
unreachable while the proposals reconciliador skips files on
Windows. A test that exercises Windows path semantics catches the
regression in CI even on Linux/macOS runners, because the failure
mode is in the **path-shape logic**, not the OS syscall layer.

The fourth match the audit found
(`plugins/proposals/src/lib/shared/branch-gc-engine.ts:125`) is a
**git branch** namespace check, not a filesystem path — unaffected.

## why this design

The fix is a single helper:

```ts
const isContained = (child: string, parent: string): boolean => {
  const rel = relative(parent, child);
  return rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel);
};
```

`relative()` is platform-aware (delegates to `path.relative` on POSIX
and `path.win32.relative` when the inputs are detected as Windows
paths via the existing `sep` heuristic in `proposal-paths.ts`). The
helper is test-friendly: passing `path.win32.join(...)` values
returns the same shape as the POSIX case.

The existing `joinUnderRoot` helper (in
`packages/core/src/lib/shared/join-under-root.ts`) does part of this
but is focused on **path construction** (it rejects `..` escapes
during construction). It does not **validate an existing child
path** the way `isContained` does. Both stay; the new helper fills
the gap.

## Tasks

### S1 — The `isContained` helper

`plugins/proposals/src/lib/shared/path-contained.ts`:

- Export `isContained(child, parent)`.
- Export `isContainedWithReason(child, parent)` that returns the
  actual computed `relative()` value (for diagnostics in
  `state_health` / `state_repair`).
- Tests at
  `plugins/proposals/tests/src/lib/shared/path-contained.spec.ts`:
  POSIX case, Windows case (using `path.win32.join(...)`), exact
  equality (root contains itself), and the `..` escape.

### S2 — Migrate the three call sites

- `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts:619-625`
  — replace the `startsWith` check with `isContained(childAbs,
  proposalsDirAbs)`.
- `plugins/proposals/src/lib/proposals/proposal-paths.ts:64`
  — same.
- `plugins/proposals/src/lib/tools/continue-proposal.tool.ts:220`
  — same.

### S3 — Explicit Windows test

`plugins/proposals/tests/src/lib/proposals/sync-proposal-registry-windows.spec.ts`:

- Use `path.win32` for the proposal directory and a synthetic file
  layout.
- Run `scanAllProposalIds` and assert that:
  - Files under `ready\\` are picked up.
  - Files under `done\\feats\\` are picked up.
  - Files under a sibling directory (e.g. `legacy\\` next to the
    proposal root) are NOT picked up.

### S4 — Lint

`tools/scripts/lint/no-posix-startswith-for-path-containment.script.ts`:

- Walk `plugins/**/src/lib/**/*.ts`.
- Flag any `childAbs.startsWith(\`${dirAbs}/\`)` (or `path.sep`
  variant) that is not wrapped in a `path.win32` test.
- Wire into `bun run validate`.

## Acceptance

- The three call sites use `isContained`.
- The new Windows test exits 0.
- The new lint exits 0 on the current surface.
- `bun run validate` stays green.

## Out of scope

- A general POSIX/Windows file-walker replacement. The fix is
  surgical to the three containment checks.
- Other `startsWith` calls in the codebase that are NOT
  path-containment (e.g. string-prefix matching on proposal
  filenames).