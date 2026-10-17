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

Each finding below came out of the work of 2026-10-16/17 (Batuta f00551, the review swarm, two outside audits) and was confirmed against `develop` before it was written. When this proposal is done, a spend that needs the user's confirmation can get it, a tool's description has one source, the site carries no data nobody produces, and the remaining silent states of the workflow are said where an agent or the owner looks.

## why

The owner, 2026-10-17: "una revisión completa y exhaustiva de todo el proyecto para sacar propuestas nuevas de mejora para que el proyecto pase a una fase de endurecerse … fuente de la verdad, agnóstico, clean code, código reutilizado y supermantenible". Confirmed on `develop` at e8dd23943:

- **The spend confirmation can never be given.** `plugins/orchestrator-runner/src/lib/invoke/token.ts` documents a gate the host wires to MCP elicitation; nothing wires it, so `denyAllConfirmationGate` answers every spend. With the default `confirmBeforeExecute: true` no `api`/`cli` invocation can run at all. Safe, but the feature it guards is dead. f00551 S2 added an elicitation adapter for discovery consent; the same adapter can ask for a spend.
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

## slices

- global_gate: type

### S1 — A spend that needs confirmation asks the user

- **Status**: in-progress
- **Files**:
  - `plugins/orchestrator-runner/src/lib/invoke/token.ts`
  - `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts`
  - `plugins/orchestrator-runner/src/lib/tools/invoke.tool.ts`
  - `plugins/orchestrator-runner/src/index.ts`
  - `plugins/orchestrator-runner/tests/src/lib/invoke/token.spec.ts`
- **Gate**: type
- acceptance:
  - "With `confirmBeforeExecute: true`, a spending hop asks the user through the host's MCP elicitation (provider, cost tier); a yes mints the one-time token the manager verifies, a no or a host without elicitation spends nothing, as before."

### S2 — A tool's description has one source

- **Status**: in-progress
- **Files**:
  - `apps/web/scripts/check-i18n.ts`
- **Gate**: type
- acceptance:
  - "The site's English description of every registered tool is compared with the description the tool registers; a difference fails the check, naming the tool."

### S3 — The site carries no data nobody produces

- **Status**: in-progress
- **Files**:
  - `apps/web/src/data/token-roi.json`
  - `apps/web/src/data/token-budget.json`
  - `tools/scripts/report/token-roi.script.ts`
- **Gate**: type
- acceptance:
  - "Data files no page reads and no generator writes are removed with the generator that is wired to nothing; nothing that reads or builds the site changes."

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

- **Status**: pending
- **Files**: `packages/core/src/lib/cli/assemble.ts`
- **Gate**: type
- acceptance:
  - "A host server whose code is older than the workspace's checkout of its own package says so in its status answers, with the command that restarts it."

### S9 — Who made a piece of work is recorded

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/services/carried-work.service.ts`
- **Gate**: type
- acceptance:
  - "The agent, unit and session that make a commit are recorded with it when it is made; reconstruction from dates and refs is only the fallback for work made before."

## acceptance

- A spend that needs the user's confirmation can be confirmed.
- A tool's description has one source.
- The site publishes no data nobody produces.
- The remaining silent states are said where an agent or the owner looks.
