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
- **Files**: `plugins/proposals/src/lib/agents/agent-loop-detector.ts`, `plugins/proposals/src/lib/agents/loop-detector-service.ts`, `plugins/proposals/src/lib/agents/loop-detector-config.ts`
- **Status**: ready
- **Gate**: `bun run validate`
- **Acceptance**:
  - `IExtendedToolCall.outcome` is a required field, populated by `onToolCall` based on the `_result` / `_error` shape returned by core.
  - `detectAgentLoop` filters out `outcome: 'ok'` calls before counting repeats.
  - Spec: 8 successful `agent_lock claim` calls do not trigger `isStuck` (regression fixture).
  - No change to the public `IMcpVertexHostConfig.isAgentStuck` signature.

### S2 — timestamp-cooldown
- **Files**: `plugins/proposals/src/lib/agents/agent-loop-detector.ts`, `plugins/proposals/src/lib/agents/loop-detector-config.ts`
- **Status**: ready
- **Gate**: `bun run validate`
- **Acceptance**:
  - `LOOP_DETECTOR_DEFAULTS` exposes `cooldownMs: 30_000` (configurable via CLI / config file).
  - `detectAgentLoop` exposes a new option `cooldownMs`; default 30 000.
  - Spec: 8 calls spaced 60s apart do not trigger `isStuck`; 8 calls spaced 1s apart do.
  - `groupConsecutiveRepeats(window, cooldownMs)` is a pure helper exported from `agent-loop-detector.ts`.

### S3 — progress-aware agent-class filter
- **Files**: `plugins/proposals/src/lib/agents/loop-detector-service.ts`
- **Status**: ready
- **Gate**: `bun run validate`
- **Acceptance**:
  - `isModifying(tool)` returns `true` for `agent_lock`, `agent_worktree`, `proposal_transition`, `proposal_block`, `proposal_resume`, `auto_work`, `delegate`, `continue_proposal`, `sync_proposals`.
  - For swarm-coordination tools, `madeProgress` is computed by diffing the lock file (and/or `docs/proposals/index.json`) instead of `git diff`.
  - Spec: 3 failed `agent_lock claim` calls with unchanged lock file trigger `noProgressStuck` within `noProgressThreshold`.
  - The existing `noProgressThreshold: 3` is **unchanged** (no inflation).

### S4 — load-test harness + regression spec
- **Files**: `plugins/proposals/tests/src/lib/agents/loop-detector-load.spec.ts`, `plugins/proposals/tests/src/lib/agents/agent-loop-detector.spec.ts` (extend)
- **Status**: ready
- **Gate**: `bun run validate`
- **Acceptance**:
  - Spec: replaying the 2026-06-27 session as a fixture does not flag `isStuck`.
  - Spec: a synthetic 8-call tight loop with 100ms spacing **does** flag `isStuck` with `repeatCount: 8`.
  - Spec: 8 calls with `outcome: 'ok'` do not flag `isStuck` even within cooldown (S1 regression).
  - Spec: 8 calls spaced 60s apart with mixed outcomes do not flag `isStuck` (S2 regression).
  - Spec: 3 failed swarm-coordination calls flag `noProgressStuck` (S3 regression).

## acceptance

- The detector still fires on a real stuck loop (S4 spec pin).
- The detector does **not** fire on the 2026-06-27 session shape (S4 spec pin).
- The detector does **not** fire on legitimate re-intent patterns (S1, S2 specs).
- The detector catches a swarm-coordination stall earlier via `noProgressStuck` (S3 spec).
- `bun run validate` exits 0 at the end of every slice.
- The handoff packet schema (`mcp-vertex/handoff/1`) is unchanged.
- No public API breakage: `IMcpVertexHostConfig.isAgentStuck` signature unchanged; core host config consumers unchanged.

## risks and mitigations

| Risk | Mitigation |
|---|---|
| `outcome: 'ok'` filter weakens detection of genuine repeat-then-succeed patterns (e.g. agent retries a flaky read) | S4 spec pins both directions: success-only repeats do not fire, tight mixed-outcome loops still fire. |
| Cooldown window of 30s is wrong for some hosts | Make it configurable per-host via `mcp-vertex.config.json#plugins.proposals.loopDetector.cooldownMs`. Default 30s, host can shrink to 5s or grow to 5min. |
| `SWARM_COORDINATION_TOOLS` list gets stale as new tools land | Add a lint spec that walks the proposals plugin's tool registrations and asserts every `proposals_*` tool appears in `SWARM_COORDINATION_TOOLS` (or has an explicit `isCoordination: false` marker). |
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