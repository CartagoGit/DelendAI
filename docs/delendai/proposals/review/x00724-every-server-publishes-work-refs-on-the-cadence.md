---
id: x00724
title: "Every server publishes work refs on the cadence"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-28
priority: P0
related: [x00691, x00722]
last-transition-id: d5dfa66a-bea5-4871-8e71-15a7f12159f0
last-correlation-id: d5dfa66a-bea5-4871-8e71-15a7f12159f0
last-transition-from: in-progress
---

# x00724 — Every server publishes work refs on the cadence

## goal

Agents' committed work reaches its work ref on the remote at the cadence
the development policy declares, from every delendai server, however it
was started and whatever plugins it has loaded.

## why

The publisher that pushes agents' work checkouts belonged to the
`commit-policy` plugin and started when that plugin registered. Under the
managed surface plugins load on first use and are evicted after five idle
minutes, so the publisher ran only while an agent happened to be using a
`commit-policy` tool. Reviewers and implementers working through other
tools had their commits pushed by nothing, and the owner saw no branch
move. With x00722 every delendai write in a unit is committed; this is what
makes those commits visible.

## why this design

- **The server owns it.** `createMcpProject` starts the publisher in
  `start()` and stops it in `dispose()`, and both launchers (the CLI's
  `__serve` and the repository's host server) go through it. A project
  built but never started, as in most specs, schedules nothing.
- **It moves into core, unchanged**: `wip-engine/work-checkout-publisher.ts`,
  with the push (`work-ref-publication.ts`) and the remote resolution
  (`durability-remote.ts`) it uses. `commit-policy`'s checkpoints use the
  same functions from core, so a work ref reaches the remote one way.
- **It still never commits**, and stands down while the server runs older
  code than its checkout (x00691), now answered by the host config.
- The remote is `origin` when it exists, as `resolveDurabilityRemote`
  already decided with no `push.remote` configured.
- x00691 and x00546 name the files at their old paths, which is what they
  shipped; the proposal-files baseline records the move.
- Five public exports enter the barrel (the push and its remote); four
  that nothing references leave it.

## non-goals

- Running the startup reconciliation and the checkout hydration in every
  launcher; the CLI's server still runs neither. That is its own proposal.

## architecture

- `packages/core/src/lib/wip-engine/{work-checkout-publisher,work-ref-publication,durability-remote}.ts`
  (moved from `plugins/commit-policy`).
- `packages/core/src/lib/project/create-mcp-project.ts`: start and stop.
- `packages/core/src/lib/contracts/interfaces/host-config.interface.ts`,
  `packages/core/src/lib/cli/assemble.ts`: `runtimeBehindCheckout`.
- `plugins/commit-policy/src/index.ts`: no publisher of its own.

## Slices

- global_gate: none

### S1 — The server publishes; the plugin does not

- **Status**: review
- **Gate**: `npx vitest run packages/core/tests/src/lib/project/create-mcp-project-start.spec.ts packages/core/tests/src/lib/wip-engine/work-checkout-publisher.spec.ts`
- **Files**:
  - `packages/core/src/lib/wip-engine/work-checkout-publisher.ts`
  - `packages/core/src/lib/wip-engine/work-checkout-publisher.interface.ts`
  - `packages/core/src/lib/wip-engine/work-ref-publication.ts`
  - `packages/core/src/lib/wip-engine/durability-remote.ts`
  - `packages/core/src/lib/wip-engine/durability-remote.constant.ts`
  - `packages/core/src/lib/project/create-mcp-project.ts`
  - `packages/core/src/lib/contracts/interfaces/host-config.interface.ts`
  - `packages/core/src/lib/cli/assemble.ts`
  - `packages/core/src/public/index.ts`
  - `tools/scripts/lint/core-public-consumers.baseline.json`
  - `tools/scripts/lint/proposal-files-exist.baseline.json`
  - `plugins/commit-policy/src/index.ts`
  - `plugins/commit-policy/src/lib/persistence/wip-persistence.ts`
  - `plugins/commit-policy/src/lib/services/work-ref-checkpoint.service.ts`
  - `packages/core/tests/src/lib/wip-engine/work-checkout-publisher.spec.ts`
  - `packages/core/tests/src/lib/project/create-mcp-project-start.spec.ts`
  - `plugins/commit-policy/tests/src/register-runtime.spec.ts`

## dependency graph

None.

## acceptance

- A started server schedules the publisher at the policy's cadence, with
  no `commit-policy` tool ever called, and stops it when disposed.
- `commit-policy` schedules no publisher of its own.
