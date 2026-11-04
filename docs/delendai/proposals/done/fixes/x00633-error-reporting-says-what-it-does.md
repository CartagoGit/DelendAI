---
id: x00633
title: "Error reporting says what it does"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-24
shipped-in: ["33a750721", "309bbe59d"]
last-transition-id: ff81fa82-4b88-4834-bb9f-82fba99af65a
last-correlation-id: ff81fa82-4b88-4834-bb9f-82fba99af65a
last-transition-from: review
---

# x00633 — Error reporting says what it does

## goal

Every description of the error-reporting plugin states its actual
default: on, announced at every start, one config line to turn it off.

## why

Reported by an external review on 2026-09-24. The plugin manifest and
the package description said reports are opened "after explicit
opt-in", while the runtime defaults to `enabled: true` and announces it
on every start. f00160 decided that on purpose ("transparent, a simple
opt-out, not opt-in"); the manifest and package text were never updated.
A privacy statement that contradicts the behaviour is a defect even when
the behaviour is the intended one.

## why this design

- The behaviour is the decided one (f00160), so the text changes, not
  the default. Whether the default should become opt-in is a separate
  decision for the project owner.
- The manifest summary feeds five generated artifacts and the managed
  lazy catalog; all are regenerated from it.

## non-goals

- Changing the default.

## Slices

- global_gate: none

### S1 — The manifest and the package description state the default

- **Status**: done
- **Gate**: `bun run lint:plugin-manifest`
- **Files**: `plugins/error-reporting/plugin.manifest.ts`,
  `plugins/error-reporting/package.json`,
  `plugins/error-reporting/AGENT.md`,
  `docs/delendai/generated/plugin-manifests.generated.json`,
  `docs/delendai/plugins/auto-generated/error-reporting.md`,
  `apps/web/src/data/plugins/catalog.generated.ts`,
  `apps/web/src/generated/plugin-manifest-catalog.generated.ts`,
  `packages/core/src/lib/registry/generated/first-party-manifest-entries.generated.ts`,
  `packages/core/src/lib/plugins/managed-lazy-catalog.generated.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Independiente: implementer claude-opus-5-5, reviewer minimax-3. Verifiqué 309bbe59d3. PR MERGED. The manifest and the package description state the default
- review-attribution: claude-opus-5-5 from commit 309bbe59d38f names refs/heads/delendai/wip/claude-opus-5-5/x00633-all-g1/error-reporting-finishes-its-writes-before-dispose (309bbe59d38fa108b1b995e2091e4c017052ee3a), opened by minimax-3
### S2 — A report is finished before the plugin is

- **Status**: done
- **Gate**: `npx vitest run plugins/error-reporting/tests/in-flight-reports.service.spec.ts plugins/error-reporting/tests/plugin-dispose.spec.ts plugins/error-reporting/tests/plugin-tool-registration.spec.ts`
- **Files**: `plugins/error-reporting/src/index.ts`,
  `plugins/error-reporting/src/lib/in-flight-reports.service.ts`,
  `plugins/error-reporting/src/lib/contracts/interfaces/in-flight-reports.interface.ts`,
  `plugins/error-reporting/tests/in-flight-reports.service.spec.ts`,
  `plugins/error-reporting/tests/plugin-dispose.spec.ts`,
  `plugins/error-reporting/tests/plugin-tool-registration.spec.ts`

The failure hooks fired their reports with `void` and the plugin had no
`dispose`, so a report could still be writing its dedupe state after
the host disposed the plugin and deleted the workspace. On 2026-09-24
the token-budget measurement harness, which disposes every plugin
before deleting its fixture, failed on #408 with `ENOTEMPTY … rmdir
'/tmp/tok-report-…/.cache/delendai/error-reporting'`. The hooks still
return at once; the plugin's `dispose` now settles every report still
in flight.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Independiente: implementer claude-opus-5-5, reviewer minimax-3. Verifiqué 33a750721. PR MERGED. A report is finished before the plugin is
- review-attribution: claude-opus-5-5 from commit 33a750721131 names refs/heads/delendai/wip/claude-opus-5-5/x00633-S1-g1/error-reporting-says-what-it-does (33a750721131869d37297ee8a21d5828956af97f), opened by minimax-3
## acceptance

- No text in the repository says error reporting needs an opt-in.
