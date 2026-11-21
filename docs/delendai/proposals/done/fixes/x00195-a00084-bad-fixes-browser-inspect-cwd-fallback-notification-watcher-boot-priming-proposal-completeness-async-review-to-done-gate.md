---
id: x00195
title: "a00084 BAD fixes — browser_inspect cwd fallback, notification watcher boot priming, proposal-completeness async + review-to-done gate"
kind: fix
status: done
type: proposal
track: a00084-audit-followup
date: 2026-07-30
shipped-in:
    - 6bccb6db # fix(x00195): a00084 BAD fixes — browser_inspect, notification watcher, proposal completeness + review-to-done gate
---

# x00195 — a00084 BAD fixes — browser_inspect cwd fallback, notification watcher boot priming, proposal-completeness async + review-to-done gate

## Goal

Fix 4 BAD findings from a00084 (concurrent-agent audit, seguimiento de a00083):

- **#13** `plugins/browser/src/lib/tools/browser-inspect.tool.ts` — `resolvePluginCacheDir` fell back to `join(process.cwd(), '.cache', 'mcp-vertex')` even though the plugin entry (`index.ts`) always injects a real, required `ctx.pluginCacheDir`. In a multi-workspace session, screenshots/captures could land wherever the host process happened to be running from.
- **#14** `plugins/notification/src/lib/services/watcher.ts` — `createReleaseWatcher.start()` only armed the interval timer and `fs.watch`; the very first tick, whichever event triggered it, was always the (silent) baseline-establishing scan, since `prev` starts undefined. If a peer released its lock in the window right after a new watcher booted, and THAT release was what caused the first-ever tick to fire, it was swallowed into the baseline and never reported.
- **#16** `plugins/proposals/src/lib/services/proposal-completeness.ts` — the default file-existence probe used `require('node:fs').statSync`, sync I/O reachable from the public `proposal_transition` handler.
- **#17** `plugins/proposals/src/lib/tools/proposal-transition.tool.ts` — the slice/file completeness gate only ran on the `ready|pending → done` zero-work shortcut, not on `review → done`. Peer review only ever inspects the proposal's markdown text, never the filesystem, so an approving reviewer had no way to notice a `Files:` entry doesn't exist or a slice is still non-`done`.

Fixing #16/#17 together also surfaced and fixed an adjacent gap: the completeness probe never resolved relative `Files:` paths against a workspace root (implicitly trusting `process.cwd()`, the same class of bug this session already fixed elsewhere for host-server.script.ts in x00186) — `guardSlicesComplete`/`guardTransitionToDone` now accept an optional `workspaceRoot` and thread it through from `proposal-transition.tool.ts`'s own `options.workspaceRoot`.

## why

#13 breaks cache eviction and the usage-tracking boot sweep (both depend on a stable cache path) whenever a host runs from a directory other than the workspace. #14 means a subscriber via `notification_await_lock` can miss a release that just happened and wait for the next one instead — a correctness gap in the "no polling, push instead" promise. #16 is a rule-3 violation (sync I/O in a hot, publicly-reachable path). #17 is a workflow-integrity gap: a proposal can currently land in `done/` via peer approval with declared files that don't exist or slices still in `rework` — a reviewer literally cannot see that from the markdown alone.

## non-goals

- Extending workspaceRoot-resolution to every OTHER caller of file-existence checks across the proposals plugin - only proposal-completeness.ts's probe was proven to have this specific gap
- Changing what force:true bypasses beyond the existing precedent (it already skips peer-review + the validate-evidence-freshness check in this same function; completeness now follows the identical precedent, not a new exemption)

## Slices

- global_gate: none

### S1 — browser_inspect: require pluginCacheDir, remove cwd fallback
- **Status**: done
- **Files**: `plugins/browser/src/lib/tools/browser-inspect.tool.ts`, `plugins/browser/src/lib/tools/browser-inspect.tool.spec.ts`
- **Gate**: type
- acceptance:
  - "IBrowserInspectToolOptions.pluginCacheDir is required, not optional; the process.cwd() fallback and its helper are removed"
  - "bun test plugins/browser passes (24/24)"

### S2 — notification watcher: prime baseline eagerly at start()
- **Status**: done
- **Files**: `plugins/notification/src/lib/services/watcher.ts`, `plugins/notification/tests/src/lib/notification.spec.ts`
- **Gate**: type
- acceptance:
  - "start() calls tick() once immediately in addition to arming the interval/fs.watch"
  - "New regression test proves the fix: verified failing without it (temporarily reverted, confirmed red), passing with it"

### S3 — proposal-completeness: async probe + workspaceRoot resolution
- **Status**: done
- **Files**: `plugins/proposals/src/lib/services/proposal-completeness.ts`, `plugins/proposals/tests/src/lib/services/proposal-completeness.spec.ts`
- **Gate**: type
- acceptance:
  - "guardSlicesComplete is async and its default probe uses fs/promises.stat, not statSync"
  - "guardSlicesComplete/guardTransitionToDone accept an optional workspaceRoot that resolves relative Files: entries instead of implicitly trusting process.cwd()"

### S4 — proposal-transition: completeness gate on every finalTo=done transition
- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`, `plugins/proposals/tests/src/lib/peer-review-gate.spec.ts`, `plugins/proposals/tests/src/lib/tools/proposal-transition.tool.spec.ts`, `plugins/proposals/tests/src/lib/transition-untracked-file.spec.ts`
- **Gate**: type
- acceptance:
  - "The completeness guard now runs whenever finalTo === 'done', not just the ready/pending shortcut, gated by args.force !== true (matching the existing validate-evidence precedent in the same function)"
  - "New regression test: a review→done transition with independent peer approval but a missing declared file now correctly fails with missing-declared-files, where it previously shipped with ok:true"
  - "Full plugins/proposals suite green (1113/1113); fixed 2 pre-existing fixtures whose Files:/Status: never mattered before this gate applied to review→done"

## acceptance

- IBrowserInspectToolOptions.pluginCacheDir is required, not optional; the process.cwd() fallback and its helper are removed
- bun test plugins/browser passes (24/24)
- start() calls tick() once immediately in addition to arming the interval/fs.watch
- New regression test proves the fix: verified failing without it (temporarily reverted, confirmed red), passing with it
- guardSlicesComplete is async and its default probe uses fs/promises.stat, not statSync
- guardSlicesComplete/guardTransitionToDone accept an optional workspaceRoot that resolves relative Files: entries instead of implicitly trusting process.cwd()
- The completeness guard now runs whenever finalTo === 'done', not just the ready/pending shortcut, gated by args.force !== true (matching the existing validate-evidence precedent in the same function)
- New regression test: a review→done transition with independent peer approval but a missing declared file now correctly fails with missing-declared-files, where it previously shipped with ok:true
- Full plugins/proposals suite green (1113/1113); fixed 2 pre-existing fixtures whose Files:/Status: never mattered before this gate applied to review→done
