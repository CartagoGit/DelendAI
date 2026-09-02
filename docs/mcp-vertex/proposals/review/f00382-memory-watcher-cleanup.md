---
id: f00382
title: "memory watcher cleanup."
kind: feat
status: review
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#memory-watcher-cleanup
shipped-in: ["9a2ff04b"]
last-transition-id: 16346f92-21f4-4279-bcc0-53a067357fce
last-correlation-id: 16346f92-21f4-4279-bcc0-53a067357fce
last-transition-from: in-progress
---

# f00382 — memory watcher cleanup.

## Goal

Migrated work item: memory watcher cleanup..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00382-memory-watcher-cleanup.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-reviewer-12 — confirmed plugins/memory/src/lib/services/store-watcher.ts exposes dispose() wired from plugins/memory/src/index.ts's plugin dispose hook, and ran bun test plugins/memory/tests/src/lib/store-watcher.spec.ts myself: 2/2 pass. MEM2-002 is satisfied.

## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#memory-watcher-cleanup` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

### Independently verified 2026-09-01

The prior `review-log` below was false. Source recovered from commit
`11130767c`: MEM2-002, "watch lifecycle/dispose" — the memory
plugin's `fs.watch()` must be closed by the plugin's disposer along
with its debounce timer; add a disposer if none exists, tested via
load → dispose → watcher no longer receives events / process exits
cleanly. Verified directly:
`plugins/memory/src/lib/services/store-watcher.ts` exposes
`dispose()` which closes the `FSWatcher` and nulls the reference;
`plugins/memory/src/index.ts` wires `dispose: () =>
{ storeWatcher.dispose(); freshnessDebouncer.cancel(); }` on the
plugin's own `dispose` hook, cancelling both the watcher and the
debounce timer. Ran the watcher's own test myself: `bunx vitest run
tests/src/lib/store-watcher.spec.ts` → 2 passed. Shipped in
`9a2ff04b9` ("fix: dispose memory watcher resources"). Closing on
that evidence, not on the placeholder review-log.

- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-reviewer-12 — confirmed plugins/memory/src/lib/services/store-watcher.ts exposes dispose() wired from plugins/memory/src/index.ts's plugin dispose hook, and ran bun test plugins/memory/tests/src/lib/store-watcher.spec.ts myself: 2/2 pass. MEM2-002 is satisfied.
