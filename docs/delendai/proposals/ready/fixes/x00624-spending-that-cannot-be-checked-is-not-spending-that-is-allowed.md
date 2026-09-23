---
id: x00624
title: "Spending that cannot be checked is not spending that is allowed"
kind: fix
status: ready
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

- **Status**: pending
- **Gate**: `npx vitest run plugins/orchestrator-runner/tests/src/lib/invoke`
- **Files**: `plugins/orchestrator-runner/src/lib/invoke/limits-store.ts`,
  `plugins/orchestrator-runner/src/lib/invoke/spend-guard.ts`,
  `plugins/orchestrator-runner/src/index.ts`
- The view carries `observed: 'known' | 'unknown'` with a reason. With a
  cap configured and observed spend unknown, the guard returns a block
  that names the unreadable file. With no cap configured, spending is
  still allowed. Specs cover a missing, a corrupt and an unreadable
  summary under a cap, and the same three with no cap.

### S2 — Every spending transport is guarded unless it declares it cannot spend

- **Status**: pending
- **Gate**: `npx vitest run plugins/orchestrator-runner/tests/src/lib/invoke`
- **Files**: `plugins/orchestrator-runner/src/lib/invoke/manager.ts`
- `SPEND_KINDS` is replaced by a declared exemption. A spec shows an
  `mcp-server` hop being refused by a breached cap before any process is
  spawned. A second spec pins that a new kind is guarded by default.

## acceptance

- With a cap configured, a missing, corrupt or unreadable usage summary
  never lets a paid call through. The refusal names the file.
- With no cap configured, behaviour is unchanged.
- An `mcp-server` hop under a breached cap spawns nothing.
- Adding a `ProviderKind` without declaring it non-spending gets it
  guarded.
