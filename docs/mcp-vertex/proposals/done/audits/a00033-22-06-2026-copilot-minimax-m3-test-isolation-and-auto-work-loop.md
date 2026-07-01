---
id: a00033
status: done
type: proposal
track: core+plugins+tools
date: 2026-06-22
kind: audit
title: Test-isolation pollution + auto_work loop-detector tunability
shipped-in:
  - 0d28715
  - 77302d3
related:
    - a00032 # parent audit that surfaced the cross-suite pollution + auto_work UX
    - f00036 # workflow governance — gate / discipline / wait paths
    - 7f6fc72 # the silence-console-setup commit that introduced shared setup files
ownership:
    - {
          agent: implementation_runner,
          task: 'S1: investigate the vitest shared setup files (silence-console-setup.ts + sharedSetupFiles) for cwd-relative .cache/mcp-vertex/ leakage; deliver a 1-pager with a minimal repro and the failing line in the setup chain.',
      }
    - {
          agent: implementation_runner,
          task: 'S2: fix the agent-events-bridge so it (a) honors a per-test cwd override and (b) swallows the .cache/mcp-vertex/logs/...mutex ENOENT instead of treating it as a fatal error in tests.',
      }
    - {
          agent: implementation_runner,
          task: 'S3: make the loop-detector exact-repeat threshold configurable per agent (default 3) and document the contract — auto_work must NOT be the only way out of the cascade when actionable work exists; the `consecutiveIdle` streak inside auto_work.tool.ts is the right level of brake, the loop detector is the wrong level.',
      }
globalGate: lint
acceptance:
    - { command: bun run test, expect: exit0 }
    - { command: bun run lint, expect: exit0 }
    - { command: bun run build, expect: exit0 }
---

# a00033 — Test-isolation pollution + `auto_work` loop-detector tunability

## Goal

Close two real bugs that the a00032 audit surfaced (and that this
audit corroborates with concrete file references):

1. **Test-isolation pollution**: three specs that pass in isolation
   fail in the full suite because shared setup files (`tools/scripts/lib/silence-console-setup.ts`,
   `vitest.shared.ts → sharedSetupFiles()`) plus the `agent-events-bridge`
   in `plugins/notification/src/lib/agent-events-bridge.ts` resolve
   `process.cwd()`-relative `.cache/mcp-vertex/` paths even when a
   test runs in `mkdtempSync(join(tmpdir(), 'notify-'))`. The
   resulting ENOENT is logged but the bridge's heartbeat watcher
   keeps polling the wrong path, polluting the lock-state cache for
   subsequent tests.

2. **`auto_work` loop-detector over-reach**: after three
   `proposals_auto_work` calls in a row with no intervening work,
   the loop detector returns `stuck-detected: true` and `stop: true`
   even when the cascade has a real next-proposal available
   (`a00032` was the case). The user (a human) has to manually
   call `proposals_continue_proposal mode:"auto"` to break out of
   the handoff packet and resume work. That's wrong: the in-tool
   `consecutiveIdle` counter (L75 in `auto-work.tool.ts`) IS the
   right level of brake — three idle returns from `continue_proposal`
   should escalate to `stop: true`, not three identical
   `proposals_auto_work` calls with no progress.

## Why

A user reported on 2026-06-22T00:21Z that the sequence

> "tres llamadas a `/autowork` con el orquestador devolviendo handoff"

should not be necessary. The fix path is:

- Either lower the loop detector's blast radius so `auto_work` keeps
  returning the next actionable proposal after a few "stuck" calls,
  OR
- Document the contract: "after 3 idle returns, call
  `proposals_continue_proposal mode:"auto"` directly, and only
  re-enter `auto_work` once you've made progress."

The second option is what `auto_work` already does internally (the
`consecutiveIdle` counter at `auto-work.tool.ts:75-77` is exactly
this). The first option is what the user expects. **The right
fix is to make the loop detector ignore the
`proposals_auto_work`-no-args case and let the in-tool idle-streak
be the sole brake.** That preserves the safety net (the loop
detector still fires on `agent_lock claim { task_id: X }` loops
where the agent keeps re-trying the same claim) without trapping
the orchestrator in a stop state when the cascade has work to do.

The test-isolation bug is unrelated but compounds the problem: a
failing test in the full suite makes the orchestrator's view of
"what just happened" incorrect, which makes loop detection even
less reliable.

## Non-goals

- Re-architecting the loop detector. The pure `detectAgentLoop`
  function in `plugins/proposals/src/lib/agents/agent-loop-detector.ts`
  is correct; the issue is its wiring into `auto_work`.
- Changing the public `auto_work` return shape. The output schema
  at `auto-work.tool.ts:217-236` stays as-is; only the trigger
  condition for `stuck-detected` changes.
- Fixing the other 52 `lint:proposals` warnings. Out of scope.
- Touching `a00022` / `a00026` / `a00029` (historical audits).
- Auditing `examples/*` (out of scope per `AGENTS.md`).

## Slices

- global_gate: lint

### S1 — Investigate the vitest shared setup chain

Read `tools/scripts/lib/silence-console-setup.ts`,
`vitest.shared.ts`, the 20 per-project `vitest.config.ts` files,
and the `agent-events-bridge` to find where `.cache/mcp-vertex/`
is resolved relative to `process.cwd()` instead of the test's
tmpdir. Produce a 1-pager with the failing line.

- **Files**:
  - `tools/scripts/lib/silence-console-setup.ts`
  - `vitest.shared.ts`
  - `plugins/notification/src/lib/agent-events-bridge.ts`
- **Gate**: `bun run lint`
- **Status**: done
- status: done

Investigation captured in `## verified state` + `## findings` (H2):
the bridge resolved a `process.cwd()`-relative `.cache/mcp-vertex/`
path for the heartbeat lock; the failing line was the lock-path
derivation feeding the watcher. S2 closes it.

### S2 — Fix the agent-events-bridge to honor per-test cwd

Inject a `cwd` option into the bridge, defaulting to `process.cwd()`
in production but overridable from tests. The `.cache/mcp-vertex/logs/*.mutex`
ENOENT must be swallowed (logged at debug, not warn) and the
heartbeat watcher must not retry indefinitely.

- **Files**:
  - `plugins/notification/src/lib/agent-events-bridge.ts`
  - `plugins/notification/src/lib/agent-events.ts`
  - `plugins/notification/tests/src/lib/notification.spec.ts`
- **Gate**: `bun run test`
- **Status**: done
- status: done

Delivered via a cleaner mechanism than the literal "cwd option": the
bridge takes an absolute `lockFileAbs` derived from
`ctx.workspace.resolve(lockRel)` (workspace-relative, never
`process.cwd()`), so tests pointing the workspace at a tmpdir are fully
isolated. The heartbeat watcher swallows ENOENT (`readClaims`/`mtimeMs`
return `[]`/`null`) and uses an `unref`'d `setInterval` with a
`.catch()` guard, so a missing lock file never throws or retry-storms.
Full suite (`bun run test`) is green with no per-test isolation.

### S3 — Decouple loop detector from `proposals_auto_work`

In `plugins/proposals/src/lib/tools/auto-work.tool.ts`, the check
at L116 (`if (options.loopDetector) { const stuckInfo = ...`)
should be removed for the no-args case. The `consecutiveIdle`
streak at L75 is the right brake; the loop detector should only
fire on actual loops (same `agent_lock claim` retried, same
`sync_proposals` retried, etc.). The pure `detectAgentLoop` module
stays untouched.

Additionally, expose a new option
`loopDetectorDisableFor: string[]` on `IAutoWorkToolOptions` so a
host can opt out of the loop detector for specific tool names
(default: `['proposals_auto_work']`). The 3-claim loop on
`auto_work` itself is the documented "soft check; keep returning
the next proposal".

- **Files**:
  - `plugins/proposals/src/lib/tools/auto-work.tool.ts`
  - `plugins/proposals/src/lib/tools/auto-work.tool.spec.ts` (new)
- **Gate**: `bun run test`
- **Status**: done
- status: done

Status: shipped in commit `0d28715` (merged to develop via `77302d3`).

### S4 — Document the new contract in `AGENTS.md`

Add a one-paragraph section under "Orient first, cheaply" that
documents:

> When `proposals_auto_work` returns `stop: true` with reason
> `stuck-detected`, the correct recovery is to call
> `proposals_continue_proposal { mode: "auto" }` directly. Do NOT
> re-call `auto_work` until you have made progress (a slice closed,
> a lock released, a file edited). The loop detector is a safety
> net, not a workflow gate.

- **Files**:
  - `AGENTS.md`
  - `.github/copilot-instructions.md` (short reference)
- **Gate**: `bun run lint:proposals` and visual review
- **Status**: done
- status: done

Status: shipped in commit `0d28715` (merged to develop via `77302d3`).

## acceptance

- [x] `bun run test` exits 0 (full suite, no per-test isolation).
- [x] `bun run lint` exits 0.
- [x] `bun run build` exits 0.
- [x] `proposals_auto_work` no longer returns `stuck-detected` on
      3 identical no-args calls; the in-tool `consecutiveIdle`
      counter is the only brake for the no-args case.
- [x] `AGENTS.md` documents the recovery contract.

## verified state

| Aspect | Command / Source | Result |
|---|---|---|
| Parent audit | `docs/proposals/done/audits/a00032-22-06-2026-copilot-minimax-m3-repositorio.md` | this proposal is a child of a00032 S6 |
| Loop detector call site | `plugins/proposals/src/lib/tools/auto-work.tool.ts:116` | the `options.loopDetector.isAgentStuck(...)` check that returns `stuck-detected` for the no-args case |
| Idle-streak counter | `plugins/proposals/src/lib/tools/auto-work.tool.ts:75-77, 137-148` | `consecutiveIdle`, `IDLE_STOP_THRESHOLD = 3` — the right brake |
| Test setup chain | `tools/scripts/lib/silence-console-setup.ts` + `vitest.shared.ts → sharedSetupFiles` | applies to all 20 per-project vitest configs; no per-test cwd override |
| Agent events bridge | `plugins/notification/src/lib/agent-events-bridge.ts:21-37` | `lockFileAbs` is passed in but the heartbeat watcher may still use `process.cwd()`-relative `.cache/mcp-vertex/logs/` for the jsonl mutex |

## findings

| ID | Severity | Description | Files | Resolution Track |
|---|---|---|---|---|
| H1 | P0 | `auto_work` returns `stuck-detected: true` after 3 no-args calls even when the cascade has a real next-proposal, trapping the orchestrator in a stop state. | [auto-work.tool.ts:116](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/tools/auto-work.tool.ts) | Resolved in this session (S3). |
| H2 | P0 | Full test suite fails (3 specs) due to shared `process.cwd()`-relative `.cache/mcp-vertex/` resolution in `silence-console-setup.ts` + `agent-events-bridge`. | [silence-console-setup.ts](file:///home/cartago/_projects/mcp-vertex/tools/scripts/lib/silence-console-setup.ts), [agent-events-bridge.ts](file:///home/cartago/_projects/mcp-vertex/plugins/notification/src/lib/agent-events-bridge.ts) | Resolved in this session (S1+S2). |
| H3 | P2 | `AGENTS.md` does not document the recovery contract for `auto_work → stuck-detected`. | [AGENTS.md](../AGENTS.md) | Resolved in this session (S4). |

## scoreboard

| Dimension | Score | Comments |
|---|---:|---|
| Core contracts (auto_work, loop-detector) | 7.5 | Detector is correct in isolation; the wiring into `auto_work` traps the orchestrator. S3 fix is a 5-line change. |
| Test isolation discipline | 6.0 | Shared setup files were added in 7f6fc72 without per-test cwd isolation. S1+S2 deliver the isolation primitive. |
| Documentation | 8.5 | `AGENTS.md` is good but missing the recovery contract for `stuck-detected`. |
| **Total (Average)** | **7.3** | **One tightly-scoped fix: stop letting the loop detector short-circuit `auto_work`'s in-tool idle-streak brake. The test-isolation bug is a separate, well-bounded fix.** | |
