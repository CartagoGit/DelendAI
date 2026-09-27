---
id: x00682
title: "Plugins that watch every call activate at startup"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [f00645]
---

# x00682 — Plugins that watch every call activate at startup

## goal

A plugin whose job is to observe other plugins' tool calls observes them
from the first call, under lazy loading as well as eager.

## why

While measuring tool result sizes for f00645, this repository's
`usage-tracking` invocation log turned out to have no record after
2026-09-07. Its rollup kept running, so nothing looked broken.

Under `managedSurface.loading: "lazy"`, a plugin registers its hooks
(`onToolCall`, `onToolStart`, `onToolCancel`, the logs sink) only when
it activates, and it activates when one of its own tools is called.
Only `error-reporting` was declared `startupActivation: true`. So:

- `usage-tracking` recorded nothing unless someone called
  `usage_report`;
- `logs` streamed no tool events;
- `memory` did not refresh on mutations;
- the `proposals` loop detector saw nothing until a proposals tool ran.

Each failure was silent.

## why this design

- **The registrations decide.** The lazy catalog is generated from the
  eager assembly, which knows every plugin's registrations. A plugin
  that registers any tool-call observer or the logs sink is written with
  `startupActivation: true`. A new observer cannot forget to declare it,
  and the manifest flag still works for other startup side effects.
- **The cost is small and measured.** Four more plugins (logs, memory,
  proposals, usage-tracking) activate at boot. The regenerated token
  budgets are byte-identical.

- **What startup activation contributed is registered once.** A plugin
  activated at startup put its prompts in both the boot list and the
  pending lazy registrations. The first lazy materialization registered
  them again, and `plugin_activate proposals` failed with "Prompt
  delendai_proposals_work is already registered". error-reporting has no
  prompts, so this never showed before. The pending set is cleared once
  startup activation is done.

## non-goals

- Changing when a plugin's tools are exposed. Activation loads the
  module and its hooks; the surface rules stay the same.

## architecture

- `tools/scripts/generate/managed-lazy-catalog.script.ts`:
  `observesOtherPlugins`, used when writing each entry.
- `packages/core/src/lib/plugins/managed-lazy-catalog.generated.ts`:
  regenerated.
- `packages/core/src/lib/cli/assemble-plugins.ts`: pending registrations
  cleared after startup activation.

## Slices

- global_gate: none

### S1 — Observers activate at startup

- **Status**: in-progress
- **Gate**: `npx vitest run tools/scripts/generate/managed-lazy-catalog.script.spec.ts packages/core/tests/src/lib/cli/assemble.lazy-register-errors.spec.ts`
- **Files**:
  - `tools/scripts/generate/managed-lazy-catalog.script.ts`
  - `tools/scripts/generate/managed-lazy-catalog.script.spec.ts`
  - `packages/core/src/lib/plugins/managed-lazy-catalog.generated.ts`
  - `packages/core/src/lib/cli/assemble-plugins.ts`
  - `packages/core/tests/src/lib/cli/assemble.lazy-register-errors.spec.ts`

## dependency graph

None.

## acceptance

- Every plugin that registers a tool-call observer or the logs sink is
  activated at startup under lazy loading.
- A plugin activated at startup can still be activated with
  `plugin_activate`, and its prompts are registered once.
- The register-error replay is still exercised, through an observer that
  stays lazy.
