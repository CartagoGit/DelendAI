---
id: x00910
title: "What the hardening review of 2026-10-17 found: confirmations nobody can give, copies nobody checks, and silences"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-17
---

# x00910 — What the hardening review of 2026-10-17 found: confirmations nobody can give, copies nobody checks, and silences

## goal

Each finding below came out of the work of 2026-10-16/17 (Batuta f00551, the review swarm, two outside audits) and was confirmed against `develop` before it was written. When this proposal is done, a tool's description has one source, the site carries no data nobody produces, and the remaining silent states of the workflow are said where an agent or the owner looks.

## why

The owner, 2026-10-17: "una revisión completa y exhaustiva de todo el proyecto para sacar propuestas nuevas de mejora para que el proyecto pase a una fase de endurecerse … fuente de la verdad, agnóstico, clean code, código reutilizado y supermantenible". Confirmed on `develop` at e8dd23943:

- **The spend confirmation could never be given.** `plugins/orchestrator-runner/src/lib/invoke/token.ts` documents a gate the host wires to MCP elicitation; nothing wired it, so `denyAllConfirmationGate` answered every spend. Fixed in f00551 S6, where the runner's host integration lives (not repeated here).
- **A tool's description has two copies.** `apps/web/src/i18n/tools/**` carries each tool's English description again beside the one the tool registers, and nothing compares them: when f00551 S2 changed two runner tools, the site kept describing probing without consent until it was edited by hand.
- **The site publishes data nobody produces.** `apps/web/src/data/token-roi.json` (`top: []`, 2026-08-30) and `token-budget.json` (a sample from 2026-08-30) are read by no page, and `tools/scripts/report/token-roi.script.ts` that would write the first is wired to nothing. An outside audit read them as the product's metrics.
- **The cross-runtime SQLite loader exists three times.** `packages/proposals-sqlite/src/lib/bun-sqlite.helper.ts` falls back to `node:sqlite`; `packages/state-telemetry/src/lib/eta/duration-history.ts` and `.../events/work-event-store.sqlite.ts` each carry their own Bun-only copy, so telemetry dies under Node. Core may not load `bun:sqlite`, so the one loader needs a home both packages can depend on.
- **A roster entry without an account inherits the server's environment.** f00551 S3 isolates CLIs on an account; an entry with no `accountId` still spawns with every credential the server holds, for compatibility.
- **A unit whose only commits are hydration looks alive.** Its tip moves with every hydration merge, so idle and abandon detection, and `work retire`'s freshness check, read it as recent (f00551 S1a's empty unit needed `--unowned`).
- **A red publication waits on its author in silence.** The hydrator logs "red again; its author pushes next"; nothing tells the author, and `work status` / `proposals status` do not show it.
- **A long-lived host server applies the rules it started with.** This session's server predated x00908 by five hours, so retiring f00639 from `paused` did not publish until done by hand; nothing in its answers says the code it runs is behind.
- **Who made a piece of work is reconstructed, not recorded.** x00906 infers the maker of carried work from commit dates and refs; the originating agent, unit and session could be written when the work is made.

## non-goals

- What x00909 already fixes (migrations, delegation manifests, the roadmap, the test runner, replacement strings).
- Real-account Batuta smokes: they wait on the owner's consent (f00551).
- The spend confirmation: f00551 S6.

## slices

- global_gate: type

### S2 — A tool's description has one source

- **Status**: pending
- **Files**:
  - `apps/web/scripts/check-i18n.ts`
  - `tools/scripts/gen-all.script.ts`
- **Gate**: type
- acceptance:
  - "`gen:all` writes the description every tool registers (from the same registration the token measurement boots) to a generated catalogue, and `check-i18n` fails when the site's English description of a tool differs from it, naming the tool. No generated source holds registered descriptions today, so the check needs that catalogue first."

### S3 — The site carries no data nobody produces

- **Status**: in-progress
- **Files**:
  - `tools/scripts/report/token-roi.script.ts`
  - `tools/scripts/lint/proposal-files-exist.baseline.json`
  - `tools/scripts/lint/proposal-slice-completeness.baseline.json`
- **Gate**: type
- acceptance:
  - "`apps/web/src/data/token-roi.json` and `token-budget.json`, read by no page, are removed; the ROI report script writes to `.cache/delendai/reports/` instead of the site's data, and nothing that reads or builds the site changes. The two closed proposals that listed them (c00135, c00136) are recorded in the files-exist and slice-completeness baselines as files removed after closing, the case those baselines exist for."

### S4 — One SQLite loader, on every runtime

- **Status**: pending
- **Files**: `packages/state-telemetry/src/lib/eta/duration-history.ts`
- **Gate**: type
- acceptance:
  - "Telemetry opens its database through the one cross-runtime loader, under Bun and under Node; the copies are gone."

### S5 — A roster entry without an account is isolated too

- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/services/account-environment.service.ts`
- **Gate**: type
- acceptance:
  - "A CLI for an entry with no account starts from the same allowlist plus the one variable its invocation names, with a start-up migration or a report for configurations that relied on inheriting more."

### S6 — Hydration does not make a unit look alive

- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/unit-liveness.service.ts`
- **Gate**: type
- acceptance:
  - "A unit's liveness reads its own commits, not merges of the integration branch into it; a unit with none of its own is idle from when it was entered."

### S7 — A red publication is said to its author

- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-status.service.ts`
- **Gate**: type
- acceptance:
  - "`work status` and `proposals status` list each publication whose checks are red, with the failing check, for the agent that owns it."

### S8 — A stale server says so

- **Status**: in-progress
- **Files**:
  - `packages/core/src/lib/contracts/interfaces/code-freshness.interface.ts`
  - `packages/core/src/lib/cli/code-freshness.service.ts`
  - `packages/core/src/lib/cli/assemble-core-tools.ts`
  - `packages/core/tests/src/lib/cli/code-freshness.service.spec.ts`
- **Gate**: type
- acceptance:
  - "The `delendai` status collector reports `code`: the commit the server's own checkout was at when it started, the commit it is at now, and `stale: true` with the restart to do when the checkout moved through `packages/` or `plugins/`; it reads the server's checkout with `git -C`, whatever checkout a call is made for, and an installed package (no checkout) is never called stale."

### S9 — Who made a piece of work is recorded

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/services/carried-work.service.ts`
- **Gate**: type
- acceptance:
  - "The agent, unit and session that make a commit are recorded with it when it is made; reconstruction from dates and refs is only the fallback for work made before."

## acceptance

- A tool's description has one source.
- The site publishes no data nobody produces.
- The remaining silent states are said where an agent or the owner looks.
