---
id: x00703
title: "Packing refs is not creating them"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [x00694, f00644]
last-transition-id: e2fa8bcb-a0f7-47b4-89eb-e93bed7e9956
last-correlation-id: e2fa8bcb-a0f7-47b4-89eb-e93bed7e9956
last-transition-from: in-progress
---

# x00703 — Packing refs is not creating them

## goal

Git's maintenance (`git gc`, `git pack-refs`) runs whatever refs the
repository holds. The guard judges only the creation of a ref, never the
packing of one that exists.

## why

On 2026-09-27 every commit in this repository ended with `error: task
'gc' failed`; `git gc` reported `ref updates aborted by hook` and `failed
to run pack-refs`. `pack-refs` moves every loose ref into the packed
store in one `reference-transaction` whose updates read as creations
(old id zero). The guard judged each as a branch being created.
`delendai/wip/copilot/…`, which x00694 refuses as a name, therefore
aborted the whole transaction. One badly named ref, made by an agent,
stopped git's maintenance for everyone.

## why this design

- **A creation at the commit the ref already has is packing.** In the
  `prepared` state the loose ref still exists. When it points at the new
  id, the update is not judged. A new ref is still judged, and refused,
  exactly as before.

## non-goals

- Renaming or removing the badly named ref. It is its author's.

## architecture

- `packages/cli/src/commands/guard.command.ts`: `operationsForHook` skips
  such updates; `defaultGuardFacts.refAt`.
- `packages/cli/src/contracts/interfaces/guard.interface.ts`: `refAt`.

## Slices

- global_gate: none

### S1 — Maintenance is never refused

- **Status**: review
- **Gate**: `npx vitest run packages/cli/src/commands/guard.command.spec.ts`
- **Files**:
  - `packages/cli/src/commands/guard.command.ts`
  - `packages/cli/src/contracts/interfaces/guard.interface.ts`
  - `packages/cli/src/commands/guard.command.spec.ts`
- review-state: in_review
- review-implementer: claude-opus-5-5
## dependency graph

None.

## acceptance

- With `delendai/wip/copilot/…` existing, `git pack-refs --all` succeeds
  under the installed hooks, and creating another such ref is still
  refused. Without the fix, the pack fails with "aborted by hook".
