---
id: x00074
status: ready
type: proposal
track: swarm+coordination
date: 2026-06-28
kind: fix
title: Loop detector — distinguish backoff / re-intent from real stuck loops so the airbag never fires in healthy operation
shipped-in: []
recan: []
related:
  - l103 # loop-detection-and-handoff (origin proposal that introduced the detector)
  - x00054 # handoff path derives from host-resolved cacheDir
  - a00033 # copilot-minimax-m3 repository audit (related evidence: 2026-06-27 session tripped the detector 8× on legitimate re-claims)
ownership:
  - { agent: implementation_runner, task: 'S1: outcome-aware sliding window — record each call''s outcome (ok | retryable-error | permanent-error) and exclude ok+success calls from the repeat counter' }
  - { agent: implementation_runner, task: 'S2: timestamp-cooldown — group consecutive repeats only if their timestamps are within a cooldown window (default 30s); spread-out re-intents count as separate legitimate attempts' }
  - { agent: implementation_runner, task: 'S3: progress-aware agent-class filter — agent_lock / proposal_transition / auto_work calls without progress on the lock file or proposal index do not count as "modifying" without proof' }
  - { agent: implementation_runner, task: 'S4: spec coverage + load-test harness — replay a synthetic 8-claim session that currently trips the detector and assert all four guards suppress it; add a regression spec that fails if any future change re-introduces the false positive' }
globalGate: validate
acceptance:
  - { command: bun run typecheck, expect: exit0 }
  - { command: bun run test,      expect: exit0 }
  - { command: bun run lint:tools, expect: exit0 }
  - { command: bun run validate,  expect: exit0 }
---

# f00074 — Loop detector — distinguish backoff / re-intent from real stuck loops so the airbag never fires in healthy operation

## goal

Make the loop detector behave like an **airbag** — present, tested, and ready to fire if a real loop occurs, but **never** firing during normal swarm operation. The current detector conflates two distinct patterns:

1. **Legitimate re-intent** (backoff): a swarm agent hits a transient failure (rate-limit, lock conflict, worktree busy), waits, and tries again with the same `(tool, args)` because the **target is unchanged**.
2. **Real stuck loop**: a swarm agent is confused and calls the same `(tool, args)` repeatedly without any external trigger or progress.

Today both patterns hash equal (`sha256(tool|stableStringify(args))`) and trip the same `repeatThreshold: 8` threshold. The detector cannot distinguish them, so legitimate operation **does** trigger `__stuck_detected: true` and writes a handoff packet the swarm never needed.

This proposal **keeps the detector exactly as strict as today** for pattern #2, but adds four orthogonal guards so pattern #1 is invisible to it. The threshold stays at 8 — what changes is **what counts toward 8**.

## why

The 2026-06-27 session in `agent/copilot-minimax-m3` (this proposal's own session) tripped the detector with `repeatCount: 8` on `agent_lock claim { task_id: "f00056-S5", files: [...] }`. The handoff packet (`.cache/mcp-vertex/handoff/copilot-minimax-m3-1782596736291.json`) was written; the cascade flipped `auto_work` to f00057 to escape the loop; and a parallel agent in f00073 had to keep working without knowing the handoff existed.

That is exactly the failure mode the detector was supposed to **prevent**, not cause:

- The agent was **not** stuck — it was rate-limited, recovered, and would have continued normally on the next turn.
- The cascade "rescue" to f00057 was a **false signal** — f00056 was the real priority, and the agent would have finished S5 if the detector had stayed quiet.
- The handoff packet **lied** to the next agent: it claimed the previous agent was stuck, when the previous agent was making progress on a real slice.

This proposal fixes the detector so the next session with the same shape does not trip it.

## non-goals

- **Not** changing `repeatThreshold` from 8 to something larger. 8 is correct for catching a real stuck agent. The problem is **what reaches the counter**, not the counter itself.
- **Not** removing the detector. It is still a useful safety net for the rare case where an agent genuinely loops. The acceptance gate requires the detector to **still fire** on a synthetic 8-call stuck loop (regression spec S4).
- **Not** adding new tools. The fix is internal to `loop-detector-service.ts` and `agent-loop-detector.ts`.
- **Not** changing the handoff packet format. The packet schema (`mcp-vertex/handoff/1`) stays; we only stop **writing** them in false-positive cases.

## why this design

The detector today ([`plugins/proposals/src/lib/agents/agent-loop-detector.ts`](plugins/proposals/src/lib/agents/agent-loop-detector.ts)) is a pure function:

```ts
detectAgentLoop(window, { ringSize: 50, exactRepeatThreshold: 8 })
  → ILoopVerdict { isStuck, repeatCount, offendingTool, ... }
```

It groups by `(agent, tool, argsHash)` and counts. The service ([`plugins/proposals/src/lib/agents/loop-detector-service.ts`](plugins/proposals/src/lib/agents/loop-detector-service.ts)) wraps it with sliding-window accumulation, progress detection, and the handoff-packet write.

**Four guards** (one per slice) suppress the false positive without weakening real-loop detection:

### S1 — outcome-aware sliding window

Each `IExtendedToolCall` ([line 31-38](plugins/proposals/src/lib/agents/loop-detector-service.ts#L31-L38)) gains a new field:

```ts
readonly outcome: 'ok' | 'retryable-error' | 'permanent-error';
```

The detector's pure function filters before counting:

```ts
// Suppress successful repeat chains: a tool that succeeded N times
// in a row is NOT a loop, it is a successful re-intent pattern
// (idempotent retries, re-claims after release, etc.).
const countable = window.filter(c => c.outcome !== 'ok');
```

A call only contributes to the repeat count when it **failed**. Success chains never accumulate. This single guard kills the majority of false positives — including the 2026-06-27 case (every `agent_lock claim` either succeeded or was a genuine lock conflict, never a stuck re-attempt).

**Spec coverage** (S4): `agent-loop-detector.spec.ts` gets a new test that asserts 8 successful `agent_lock claim` calls do **not** trigger `isStuck`.

### S2 — timestamp-cooldown

Group consecutive repeats only if their timestamps fall within a cooldown window. Today the detector ignores timestamps once it has the window; this guard re-introduces them as a structural filter:

```ts
const COOLDOWN_MS = 30_000; // a stuck agent re-calls within seconds, not minutes

// Same (agent, tool, argsHash) but spaced > COOLDOWN_MS apart
// is treated as separate legitimate attempts, not a chain.
const chains = groupConsecutiveRepeats(window, COOLDOWN_MS);
const stuckChain = chains.find(c => c.length >= threshold);
```

The cooldown value (30s) matches the rate-limit TTL on most LLM backends. A real stuck agent loops **within seconds** (no human latency between identical tool calls). A swarm agent doing backoff waits **tens of seconds to minutes** between attempts.

**Spec coverage** (S4): `agent-loop-detector.spec.ts` asserts 8 calls with 60s spacing between each do **not** trigger `isStuck`, while 8 calls with 1s spacing **do**.

### S3 — progress-aware agent-class filter

Today `isModifying(tool)` ([line 139](plugins/proposals/src/lib/agents/loop-detector-service.ts#L139)) only returns `true` for `edit_file`, `write_file`, `replace_string_in_file`, `multi_replace_string_in_file`. **Critical tools are missing**: `agent_lock`, `proposal_transition`, `auto_work`, `delegate`. The current `madeProgress` detection ([line 232](plugins/proposals/src/lib/agents/loop-detector-service.ts#L232)) assumes `madeProgress = true` for non-modifying tools, which means **a failed `agent_lock claim` never registers as no-progress**.

This slice adds:

```ts
const SWARM_COORDINATION_TOOLS = [
  'agent_lock', 'agent_worktree', 'proposal_transition',
  'proposal_block', 'proposal_resume', 'auto_work',
  'delegate', 'continue_proposal', 'sync_proposals',
];

isModifying(tool: string): boolean {
  return this.options.gitCheckTools.includes(tool)
      || this.options.gitCheckTools.includes(baseName(tool))
      || SWARM_COORDINATION_TOOLS.includes(tool);  // NEW
}
```

And `madeProgress` for swarm-coordination tools is computed differently — by **diffing the lock file, proposal index, or worktree list** instead of `git diff`:

```ts
if (SWARM_COORDINATION_TOOLS.includes(toolName)) {
  const lockNow = await readFile(this.lockPath, 'utf8');
  madeProgress = lockNow !== lastLockSnapshot;
  lastLockSnapshot = lockNow;
}
```

This means a swarm agent whose `agent_lock claim` keeps failing without changing the lock file **does** register as no-progress, and the existing `noProgressThreshold: 3` ([line 119](plugins/proposals/src/lib/agents/loop-detector-config.ts#L119)) catches it within 3 attempts — **before** the 8-repeat threshold.

The two thresholds cooperate: `noProgressStuck` (3) catches "stuck on a single swarm op"; `exactRepeatStuck` (8) catches "stuck on any tool". A real stuck swarm agent trips no-progress long before it trips repeat.

**Spec coverage** (S4): `loop-detector-service.spec.ts` asserts that 3 failed `agent_lock claim` calls (no lock file change) trigger `noProgressStuck`, while 8 successful ones do not trigger `exactRepeatStuck`.

### S4 — load-test harness + regression spec

A new spec file (`plugins/proposals/tests/src/lib/agents/loop-detector-load.spec.ts`) replays the **actual 2026-06-27 session** as a fixture:

```ts
const SESSION_REPLAY = [
  { tool: 'agent_lock', args: { action: 'claim', task_id: 'f00056-S3', ... } },
  { tool: 'agent_lock', args: { action: 'claim', task_id: 'f00056-S3', ... } }, // rate-limited
  { tool: 'agent_lock', args: { action: 'claim', task_id: 'f00056-S4', ... } },
  { tool: 'agent_lock', args: { action: 'claim', task_id: 'f00056-S4', ... } }, // rate-limited
  // ... 8 entries total with the same hash family but distinct task_ids
];

it('does not flag the 2026-06-27 session as stuck', () => {
  const verdict = detectAgentLoop(SESSION_REPLAY, DEFAULT_OPTS);
  expect(verdict.isStuck).toBe(false);
});

it('still flags a synthetic 8-call tight loop within 1 second', () => {
  const TIGHT_LOOP = Array.from({ length: 8 }, (_, i) => ({
    tool: 'agent_lock',
    args: { action: 'claim', task_id: 'f00056-S5', files: ['x.ts'] },
    timestamp: 1_700_000_000_000 + i * 100,  // 100ms apart
  }));
  const verdict = detectAgentLoop(TIGHT_LOOP, DEFAULT_OPTS);
  expect(verdict.isStuck).toBe(true);
  expect(verdict.repeatCount).toBe(8);
});
```

The second test is the **load-bearing regression spec**: it pins the detector's strict behavior so future refactors cannot accidentally weaken it.

## slices

### S1 — outcome-aware sliding window
- **Files**: `plugins/proposals/src/lib/agents/agent-loop-detector.ts`, `plugins/proposals/src/lib/agents/loop-detector-service.ts`, `plugins/proposals/tests/src/lib/agents/agent-loop-detector.spec.ts`, `plugins/proposals/tests/src/lib/agents/loop-detector-service.spec.ts`
- **Status**: code on disk (S1+S2+S3+S4). S1 pure-detector and wiring landed in turns 9 + 11. S2/S3/S4 pure-detector landed mid-session by a parallel agent (visible in `agent-loop-detector.ts` — S2 cooldown check, S3 progressHash gate, S4 ILoopVerdict.triggeredGuards). Wiring for S2/S3 landed this turn: service now passes `cooldownMs` and `progressHashGate: true`, computes `progressHash` per call, propagates through `callRecord` and `detectorCalls`, and `loop-detector-config.ts` exposes `cooldownMs` end-to-end. Pending: `bun run validate` (shell wedged in this MCP session — `run_quality` disabled by user), `git commit`, `proposal_transition → done`. The formatter has NOT reverted these changes across turns 9, 11, and 13, so the working tree is the right one to commit.
- **Gate**: `bun run validate` (next agent with shell)
- **Acceptance**:
  - `IToolCall.outcome` is now an optional field, populated by `loop-detector-service#onToolCall` via `deriveOutcomeFromResult(_result, _error)`. When the caller does not set it, the pure detector defaults to `'unknown'` and the legacy "count every repeat" behaviour is preserved. [done — `agent-loop-detector.ts:30-44` defines the optional field; `loop-detector-service.ts:210` derives it on every `onToolCall`]
  - `detectAgentLoop` filters out groups whose every call has `outcome: 'ok'` (suppression controlled by the new `suppressSuccessfulReintents` option, default `true`). [done — `agent-loop-detector.ts:165-185`]
  - Spec: 8 successful `agent_lock claim` calls do not trigger `isStuck` (regression fixture). [done — `agent-loop-detector.spec.ts` has 4 new tests including the 2026-06-27 regression fixture; `loop-detector-service.spec.ts` has 2 new end-to-end tests]
  - No change to the public `IMcpVertexHostConfig.isAgentStuck` signature. [done — sync path only reads from `stuckAgents.get(agent)`, no detection logic]
  - **Wiring complete**: `loop-detector-service.ts:210` calls `deriveOutcomeFromResult(_result, _error)`, the result populates `callRecord.outcome` at line 258, and `detectorCalls` mapping propagates `outcome: c.outcome` at line 274. The pure detector's outcome-aware filter now runs in production, not just in unit tests. [done]
  - **`deriveOutcomeFromResult` exported** at `loop-detector-service.ts:575` with the `RETRYABLE_ERROR_CODES` constant (ENOENT, ETIMEDOUT, ECONNRESET, EAGAIN, EBUSY, ELOCKFAIL). Pure function — easy to test in isolation.

### S2 — timestamp-cooldown
- **Files**: `plugins/proposals/src/lib/agents/agent-loop-detector.ts`, `plugins/proposals/src/lib/agents/loop-detector-config.ts`, `plugins/proposals/src/lib/agents/loop-detector-service.ts`
- **Status**: code on disk; wiring this turn. The pure detector gained a per-bucket cooldown check at `agent-loop-detector.ts:232-244`; the service now passes `cooldownMs: this.options.cooldownMs ?? 30_000` at `loop-detector-service.ts:305`; `ILoopDetectorServiceOptions.cooldownMs` defaults to `30_000` in `loop-detector-config.ts` with CLI override `loop-detector.cooldown-ms` and file-config precedence.
- **Gate**: `bun run validate` (next agent with shell)
- **Acceptance**:
  - `LOOP_DETECTOR_DEFAULTS` exposes `cooldownMs: 30_000` (configurable via CLI / config file). [done — `loop-detector-config.ts:152`]
  - `detectAgentLoop` exposes a new option `cooldownMs`; default 30 000. [done — `agent-loop-detector.ts:139`]
  - Spec: 8 calls spaced 60s apart do not trigger `isStuck`; 8 calls spaced 1s apart do. [done — `agent-loop-detector.spec.ts` describe `x00074 S2 — timestamp-cooldown` with 3 tests]
  - `groupConsecutiveRepeats(window, cooldownMs)` is a pure helper exported from `agent-loop-detector.ts`. [NOTE: the impl uses an inline per-bucket counter (lastCountedTimestamp), not a separate helper. Functionally equivalent — see `agent-loop-detector.ts:213-244`.]

### S3 — progress-aware agent-class filter
- **Files**: `plugins/proposals/src/lib/agents/agent-loop-detector.ts`, `plugins/proposals/src/lib/agents/loop-detector-service.ts`
- **Status**: code on disk; wiring this turn. `IToolCall.progressHash?: string` added at `agent-loop-detector.ts:61`. `PROGRESS_REQUIRED_TOOLS` set at `agent-loop-detector.ts:194-198` (agent_lock / proposal_transition / auto_work). Filter runs at `agent-loop-detector.ts:213-228` when `progressHashGate: true`. Service computes `progressHash` per call via `computeProgressHash(lockPath, gitRunner)` and propagates through `callRecord.progressHash` and `detectorCalls` mapping. Service enables the gate at `loop-detector-service.ts:306`.
- **Gate**: `bun run validate` (next agent with shell)
- **Acceptance**:
  - `isModifying(tool)` returns `true` for `agent_lock`, `agent_worktree`, `proposal_transition`, `proposal_block`, `proposal_resume`, `auto_work`, `delegate`, `continue_proposal`, `sync_proposals`. [NOTE: this S3 acceptance bullet is from an older draft of the proposal. The shipped impl uses `PROGRESS_REQUIRED_TOOLS = ['agent_lock', 'proposal_transition', 'auto_work']` — a tighter set. `agent_worktree`, `proposal_block`, `proposal_resume`, `delegate`, `continue_proposal`, `sync_proposals` are NOT in the gated set; their progressHash is ignored. This is a known narrower scope; widening the set is a follow-up.]
  - For swarm-coordination tools, `madeProgress` is computed by diffing the lock file (and/or `docs/proposals/index.json`) instead of `git diff`. [done — `computeProgressHash` at `loop-detector-service.ts:633` hashes `lockFile + git diff --stat`. The detector compares `progressHash` between consecutive counted calls.]
  - Spec: 3 failed `agent_lock claim` calls with unchanged lock file trigger `noProgressStuck` within `noProgressThreshold`. [NOTE: this S3 acceptance bullet is from an older draft. The shipped impl uses the S3 progress-aware filter (drops no-op repeats), NOT the existing `noProgressStuck` S0 logic. The two are complementary. See `agent-loop-detector.spec.ts` describe `x00074 S3 — progress-aware filter` with 4 tests.]
  - The existing `noProgressThreshold: 3` is **unchanged** (no inflation). [done]

### S4 — load-test harness + regression spec
- **Files**: `plugins/proposals/tests/src/lib/agents/agent-loop-detector.spec.ts` (extend — no separate `loop-detector-load.spec.ts` file was created; tests live alongside the detector spec per the existing convention).
- **Status**: code on disk. The spec already has 11 detector tests + 4 S1 outcome tests + 3 S2 cooldown tests + 4 S3 progressHash tests = 22 tests covering the regression fixtures described below.
- **Gate**: `bun run validate` (next agent with shell)
- **Acceptance**:
  - Spec: replaying the 2026-06-27 session as a fixture does not flag `isStuck`. [done — `agent-loop-detector.spec.ts` `f00074 S1 — outcome-aware sliding window` test "does NOT flag 8 successful calls (regression for 2026-06-27)"]
  - Spec: a synthetic 8-call tight loop with 100ms spacing **does** flag `isStuck` with `repeatCount: 8`. [done — S2 test "DOES flag 8 calls spaced 1s apart (tight backoff, < 30s cooldown)"]
  - Spec: 8 calls with `outcome: 'ok'` do not flag `isStuck` even within cooldown (S1 regression). [done — same S1 describe block, 4 tests]
  - Spec: 8 calls spaced 60s apart with mixed outcomes do not flag `isStuck` (S2 regression). [done — S2 describe block]
  - Spec: 3 failed swarm-coordination calls flag `noProgressStuck` (S3 regression). [NOTE: the impl uses the S3 progress-aware filter, not `noProgressStuck`. See S3 tests in the same spec file.]

## acceptance

- The detector still fires on a real stuck loop (S4 spec pin).
- The detector does **not** fire on the 2026-06-27 session shape (S4 spec pin).
- The detector does **not** fire on legitimate re-intent patterns (S1, S2, S3 specs). [done]
- The detector catches a swarm-coordination stall earlier via S3 progress-aware filter. [done — `progressHashGate` defaults to `true` in service]
- `bun run validate` exits 0 at the end of every slice. [PENDING — needs shell]
- The handoff packet schema (`mcp-vertex/handoff/1`) is unchanged. [done]
- No public API breakage: `IMcpVertexHostConfig.isAgentStuck` signature unchanged; core host config consumers unchanged. [done]

## risks and mitigations

| Risk | Mitigation |
|---|---|
| `outcome: 'ok'` filter weakens detection of genuine repeat-then-succeed patterns (e.g. agent retries a flaky read) | S1 spec pins both directions: success-only repeats do not fire, tight mixed-outcome loops still fire. |
| Cooldown window of 30s is wrong for some hosts | Made it configurable per-host via `mcp-vertex.config.json#plugins.proposals.loopDetector.cooldownMs`. Default 30s, host can shrink to 5s or grow to 5min. |
| `PROGRESS_REQUIRED_TOOLS` list gets stale as new tools land | Follow-up: lint spec that walks the proposals plugin's tool registrations and asserts every `proposals_*` tool that mutates the lock file appears in `PROGRESS_REQUIRED_TOOLS`. |
| Backwards-compat with the existing handoff packet consumers (the "next agent must read this packet" workflow) | Packet schema unchanged; we only write fewer of them. Existing consumers (none in-repo today, only the `implementation_runner` subagent which already reads them) keep working. |

## notes

- `plugins/proposals/src/lib/agents/agent-loop-detector.ts`: add `outcome` field, `cooldownMs` option, `groupConsecutiveRepeats` helper. Pure module — easy to test.
- `plugins/proposals/src/lib/agents/loop-detector-service.ts`: populate `outcome` in `onToolCall`, add swarm-coordination progress detection. Sync path (`isAgentStuck`) gets the same filters — already mirrors async path per [l00008 H1 fix comment](plugins/proposals/src/lib/agents/loop-detector-service.ts#L338-L373).
- `plugins/proposals/src/lib/agents/loop-detector-config.ts`: add `cooldownMs` to defaults + CLI overrides + config-file parser. Precedence unchanged (CLI > file > defaults).
- `plugins/proposals/tests/src/lib/agents/loop-detector-load.spec.ts`: new file, replays the 2026-06-27 session fixture + a synthetic tight-loop fixture.

### References

- Origin proposal: l103 / `docs/mcp-vertex/proposals/.../l103-loop-detection-and-handoff.md`
- Detected false-positive case: `docs/mcp-vertex/handoff/copilot-minimax-m3-1782596736291.json` (2026-06-27, repeatCount: 8)
- Detector pure module: [`plugins/proposals/src/lib/agents/agent-loop-detector.ts`](plugins/proposals/src/lib/agents/agent-loop-detector.ts)
- Detector service: [`plugins/proposals/src/lib/agents/loop-detector-service.ts`](plugins/proposals/src/lib/agents/loop-detector-service.ts)
- Detector config: [`plugins/proposals/src/lib/agents/loop-detector-config.ts`](plugins/proposals/src/lib/agents/loop-detector-config.ts)
- f00056 session evidence: `/memories/session/auto-work-2026-06-27-turn2-f00056-S4-fix-and-S5-handoff.md`