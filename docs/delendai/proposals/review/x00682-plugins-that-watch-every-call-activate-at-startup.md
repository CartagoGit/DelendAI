---
id: x00682
title: "Plugins that watch every call activate at startup"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [f00645]
last-transition-id: 37dd5a49-eaea-4bf2-b0d8-c90803b7106e
last-correlation-id: 37dd5a49-eaea-4bf2-b0d8-c90803b7106e
last-transition-from: in-progress
shipped-in:
  - "85ed7fb8445872534201dacea3fe5206a43afe61"
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

- **Status**: done
- **Gate**: `npx vitest run tools/scripts/generate/managed-lazy-catalog.script.spec.ts packages/core/tests/src/lib/cli/assemble.lazy-register-errors.spec.ts`
- **Files**:
  - `tools/scripts/generate/managed-lazy-catalog.script.ts`
  - `tools/scripts/generate/managed-lazy-catalog.script.spec.ts`
  - `packages/core/src/lib/plugins/managed-lazy-catalog.generated.ts`
  - `packages/core/src/lib/cli/assemble-plugins.ts`
  - `packages/core/tests/src/lib/cli/assemble.lazy-register-errors.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real 85ed7fb84. Plugins que observan TODAS las llamadas activan al arranque: todo plugin que registre un observer de tool-call o el logs sink se activa en startup bajo lazy loading (managed-lazy-catalog generado con la marca, assemble-plugins +5 los activa), y un plugin activado al arranque sigue pudiendo activarse por el mecanismo normal. managed-lazy-catalog.script +26 con spec +25. Acceptance cubierta; gate 22/22 en lote. Sin cambios fuera de alcance.
## dependency graph

None.

## acceptance

- Every plugin that registers a tool-call observer or the logs sink is
  activated at startup under lazy loading.
- A plugin activated at startup can still be activated with
  `plugin_activate`, and its prompts are registered once.
- The register-error replay is still exercised, through an observer that
  stays lazy.
