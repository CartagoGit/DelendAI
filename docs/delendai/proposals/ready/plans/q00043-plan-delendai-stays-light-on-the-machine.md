---
id: q00043
title: "Plan: delendai stays light on the machine"
kind: plan
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-03
---

# q00043 — Plan: delendai stays light on the machine

## goal

delendai uses little disk, CPU and processes on the owner's machine: one install shared by units, one working server per workspace, idle servers at zero CPU, background work at low priority, one MCP entry per host.

## why

The owner's machine suffered on 2026-11-03. Measured in WSL:

- 61 GB written in 2 h 50 min (/proc/diskstats on sdd).
- 7 unit worktrees taking 4 GB, each with its own `bun install`.
- Three delendai host servers on one repo, from one VS Code window: one from `.vscode/mcp.json`, one from `.mcp.json` (VS Code loads it too) and one from Claude Code. Each uses about 6% CPU while idle, and the maintenance chain runs unniced.

External audit (ChatGPT, 2026-11-04, against develop f7f53bf8d), finding 5. Claim: the proposals watcher does not say whether it works. Verified by reading: `plugins/commit-policy/src/lib/triggers/proposals-watch.service.ts` exists with no state or delay report that I found; not run. S6 adds it.

## non-goals

- Removing a unit's own `node_modules` when its lockfile differs from the shared checkout's: that unit still installs.
- Changing what the proof checks; only how much machine it takes.

## slices

- global_gate: none

### S1 — A unit worktree reuses the shared checkout dependencies
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/unit-dependencies.service.ts`
- **Gate**: type
- acceptance:
  - "work enter links the worktree node_modules to the shared checkout when both lockfiles are identical, and installs only when they differ or the shared checkout has none."

### S2 — Several servers on one workspace do the work once
- **Status**: pending
- **Files**: `tools/scripts/host/host-server.script.ts`
- **Gate**: type
- acceptance:
  - "Only the lease holder polls and maintains; other servers serve their session and stay idle."

### S3 — An idle server costs no CPU
- **Status**: pending
- **Files**: `tools/scripts/host/host-idle-cost.script.ts`
- **Gate**: type
- acceptance:
  - "The idle 6 percent CPU is attributed by profile and removed; an idle server measures near zero."

### S4 — Background maintenance and proofs run niced and capped
- **Status**: pending
- **Files**: `tools/scripts/git/hydrate-candidates-after-merge.script.ts`
- **Gate**: type
- acceptance:
  - "Maintenance and proofs run at low OS priority with capped parallelism by default."

### S5 — init writes one MCP entry per host
- **Status**: retired
- **Files**: `packages/cli/src/lib/init/init-development-setup.service.ts`
- **Gate**: type
- acceptance:
  - "Answered by S2 and S3, not built: a second server on the same workspace stays idle at about 0.7% CPU (only the lease holder polls and maintains), so the duplicate entry costs almost nothing. Dropping `.vscode/mcp.json` would leave Copilot without delendai wherever VS Code does not load `.mcp.json`, and VS Code documents no setting that says whether it does (`chat.mcp.discovery.enabled` selects per-source discovery of other applications' configs; `chat.mcp.workspaceRootConfig.enabled` only governs the Add Server flow). Undocumented behaviour must not decide whether Copilot reaches delendai, so init keeps writing both files."

### S6 — The proposals watcher says how it is working
- **Status**: pending
- **Files**: `plugins/commit-policy/src/lib/triggers/proposals-watch.service.ts`
- **Gate**: type
- acceptance:
  - "The watcher exposes its state (active, degraded or polling) through the status tool and a metric for the delay from file event to processing; a spec drives each state and reads the delay."

## acceptance

- work enter links the worktree node_modules to the shared checkout when both lockfiles are identical, and installs only when they differ or the shared checkout has none.
- Only the lease holder polls and maintains; other servers serve their session and stay idle.
- The idle 6 percent CPU is attributed by profile and removed; an idle server measures near zero.
- Maintenance and proofs run at low OS priority with capped parallelism by default.
- S5 retired: answered by S2 and S3 (the idle duplicate server costs about 0.7% CPU); init keeps writing both MCP files.
