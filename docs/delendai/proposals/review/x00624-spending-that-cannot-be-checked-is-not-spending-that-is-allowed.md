---
id: x00624
title: "Spending that cannot be checked is not spending that is allowed"
kind: fix
status: review
type: proposal
track: batuta
date: 2026-09-23
---

# x00624 — Spending that cannot be checked is not spending that is allowed

## goal

The runner's spend guard answers "not allowed" when it cannot find out
whether spending is allowed. It must also cover every transport that can
spend, not a hand-picked list. This is a precondition for Batuta
(f00551) running any worker unattended on a paid provider.

## why

Both defects were first noted in Batuta's S0 reconciliation
(`docs/delendai/batuta/reconciliation.md`) and reproduced against
`develop` at `d43f019df`:

1. **An unreadable budget means "nothing breached".**
   `SpendLimitsStore` starts from a neutral view, and `loadFrom` keeps
   that view when the usage summary is missing, unreadable or corrupt.
   Its own comment calls this degrading "to 'no cap' rather than blocking
   spuriously". `decideSpendGuard` then returns `allow` because
   `breached === null`. A project that configured a monthly cap therefore
   gets no cap at all when the file that records spend cannot be read.
   It is the same fail-open the policy guard had before x00558, where an
   unreadable policy meant "allow everything".
2. **One spending transport is not guarded.** `InvocationManager` checks
   spend only for kinds in `SPEND_KINDS = {api, cli}`. `ProviderKind`
   also has `mcp-server`, which spawns an MCP server (for example
   `codex mcp-server`) and calls it as a tool; that can spend and skips
   the guard entirely. `subscription` is a passthrough today, but the
   moment Batuta's S3 makes it execute, it would inherit the same gap.
   A list of what to guard fails open for every kind added after it.

Spending stays off by default (`executeApi: false`), so neither defect
spends anything today. They stop being theoretical when Batuta enables
unattended execution, which is exactly what it is for.

## why this design

- **Configuration is the authority for limits; the summary only
  projects observed spend.** Today the caps are configured in
  `usage-tracking` (`maxSessionSpendUsd`, `maxMonthlySpendUsd`) and reach
  the runner only through the summary file (`limitsStatus`). So when that
  file cannot be read, the runner does not even know a cap exists. The
  guard gets the cap from the configuration itself, through
  `resolvePluginOptions` (the one resolver of plugin options), and the
  observed spend from the summary, so "is there a cap" and "how much has been
  spent" are two questions that can fail independently. There are three
  outcomes: `within-budget`, `breached`, and `unknown`. With a cap
  configured and observed spend unknown, the answer is `unknown`, and
  that blocks. With no cap configured, there is nothing to breach, which
  is the operator's stated choice, not a failed read.
- **The guard is the default; exemption is declared.** Instead of a set
  of kinds to guard, each kind is guarded unless it declares that it
  cannot spend. The passthrough `subscription` invoker, which executes
  nothing, can declare that. Anything new is guarded until someone says
  otherwise in code.
- **The block explains itself.** An `unknown` block names the file it
  could not read and why, the same way the policy guard's refusal does,
  so the fix is one step and nobody is tempted to switch the guard off.

## non-goals

- Atomic reservations across concurrent workers. They are real and they
  are Batuta's S4 (SQLite reservations). This proposal only makes the
  single-caller check honest; S4 builds on an honest check.
- Changing the default: spending stays disabled unless enabled.

## Slices

- global_gate: none

### S1 — An unknown budget blocks spending under a configured cap

- **Status**: done — `limits-store.spec.ts` pins that a missing, a corrupt
  and a no-longer-readable summary each make the view `unknown`, naming
  the file. `spend-guard.spec.ts` pins that `unknown` is refused under a
  session cap, a monthly cap, and a cap of 0, and allowed with no cap.
- **Gate**: `npx vitest run plugins/orchestrator-runner/tests/src/lib/invoke`
- **Files**: `plugins/orchestrator-runner/src/lib/invoke/limits-store.ts`,
  `plugins/orchestrator-runner/src/lib/invoke/spend-guard.ts`,
  `plugins/orchestrator-runner/src/lib/invoke/spend-caps.helper.ts`,
  `plugins/orchestrator-runner/src/lib/contracts/interfaces/spend-caps.interface.ts`,
  `plugins/orchestrator-runner/src/index.ts`,
  `plugins/orchestrator-runner/src/public/index.ts`,
  `plugins/orchestrator-runner/tests/src/lib/invoke/limits-store.spec.ts`,
  `plugins/orchestrator-runner/tests/src/lib/invoke/spend-guard.spec.ts`,
  `plugins/orchestrator-runner/tests/src/lib/invoke/spend-caps.helper.spec.ts`
- The view carries `observed: 'known' | 'unknown'` and the reason. The
  caps come from `usage-tracking`'s own options through `ctx.pluginOptions`
  (`spendCapsFrom`), not from the summary. `decideSpendGuard` requires them,
  so every caller has to state them. With spend unknown under a cap it
  returns `unverifiable`, and the manager answers `spend-unverifiable`
  before any call. A spec in the old suite pinned the old behaviour by
  name ("stays neutral for a missing summary") and kept passing because it
  checked only `breached: null`. It now pins `unknown`.

### S2 — Every spending transport is guarded unless it declares it cannot spend

- **Status**: done — with the guard reverted to the old list (`api`,
  `cli`), the new `mcp-server` case fails. With the declared exemption it
  passes, and nothing is spawned.
- **Gate**: `npx vitest run plugins/orchestrator-runner/tests/src/lib/invoke`
- **Files**: `plugins/orchestrator-runner/src/lib/invoke/manager.ts`,
  `plugins/orchestrator-runner/src/lib/schemas.ts`,
  `plugins/orchestrator-runner/tests/src/lib/invoke/manager.spec.ts`,
  `plugins/orchestrator-runner/tests/e2e/invoke-real-subprocess.e2e.spec.ts`
- `SPEND_KINDS` is replaced by `NON_SPENDING_KINDS = {subscription}`, whose
  invoker is a passthrough that executes nothing. `mcp-server` is guarded,
  and so is any kind added later unless it is declared here. The same set
  decides `executeApi` and confirmation, so an `mcp-server` hop now needs
  them too. That is the point: it can spend. The real-subprocess e2e said
  "mcp-server is not a spend kind" and ran with execution disabled; it now
  authorises the round-trip, and a second case proves that without
  authorisation the server is never started. `spend-unverifiable` joins
  the invoke error codes in the output schema.

## acceptance

- With a cap configured, a missing, corrupt or unreadable usage summary
  never lets a paid call through. The refusal names the file.
- With no cap configured, behaviour is unchanged.
- An `mcp-server` hop under a breached cap spawns nothing.
- Adding a `ProviderKind` without declaring it non-spending gets it
  guarded.
