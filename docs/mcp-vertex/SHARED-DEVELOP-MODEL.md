---
id: shrdoc-2026-09-02
title: "Shared-develop model: ACTIVE → SETTLING → STABLE"
---

# Shared-develop operating model

This document is the canonical description of the operating model
that `f00417` enables and `q00015` formalises. It is binding for
every agent (human or AI) and every tool that operates on this
repository. The bootstrap references it from §6 (Invariants).

## Why this model

`f00417` makes slice commits **causally bounded**: a slice commit
is only valid if the staged paths are a subset of the machine-resolved
scope at the moment the transition was emitted. With that
guarantee, the swarm can have many agents committing concurrently
on a shared `develop` branch without any agent stealing another
agent's work. The remaining concern is the **global state of the
branch**:

- A single slice commit is cheap to validate (its own scope).
- The whole branch is not — running the full validate on every
  slice would serialise the swarm.
- But leaving the branch broken forever is not acceptable either.

The shared-develop model resolves this by treating a swarm round
as an **eventually consistent** batch:

> Each commit is correct in isolation; the branch is repaired
> when the round settles.

## The three phases

```
┌────────────┐   workers === 0      ┌────────────┐  green HEAD
│  ACTIVE    │ ─────────────────▶ │  SETTLING  │ ─────────▶ STABLE
│  SWARM     │  (or barrier hit)   │  (full     │  (or
│            │                      │   validate │   DEAD_LETTER
│ commits OK │                      │   + repair │   after N retries)
│ (may be    │                      │   agent)   │
│  RED)      │                      │            │
└────────────┘                      └────────────┘
```

### ACTIVE SWARM

- Any agent may commit any slice whose files resolve canonically.
- Commits may leave `develop` red; that is acceptable.
- New workers may register via `commit-policy:settlement_register`.
- Slice trigger (`f00417`) is the primary commit path.
- Push to `develop` is permitted; no settlement gate (yet).

### SETTLING

- Triggered when `activeWorkers === 0` for ≥5s, OR by an explicit
  barrier message (`commit-policy:settlement_enter`).
- No new slice commits are accepted during this phase; the engine
  returns `SETTLEMENT_IN_PROGRESS` refusal.
- The settlement runner (`quality-policy:settlement-runner`) runs
  full validate + e2e smoke.
- On red, the repair agent (`proposals:repair-mode`) generates
  slices restricted to the failing files. The swarm re-activates
  until either the next settle is green or `maxRounds` is reached.

### STABLE

- HEAD is green. `commit-policy:settlement_status` returns
  `phase: 'stable'`, `lastGreenHead: <sha>`.
- New workers may register; the model flips back to ACTIVE.

## Boundaries

| Phase        | Slice commits | Push to develop | Repair agent | Timeout |
| ------------ | ------------- | --------------- | ------------ | ------- |
| ACTIVE       | yes           | yes             | dormant      | none    |
| SETTLING     | refused       | blocked         | active       | 600s    |
| STABLE       | yes           | yes             | dormant      | none    |

## What this is NOT

- Not "everyone gets a worktree" (`agentWorktree: true`). The
  shared checkout is intentional; this model assumes it.
- Not a global commit queue. Commits stay parallel and atomic
  within a round; the serialisation only kicks in when settling.
- Not per-slice full validate. f00417 already prevents the worst
  attribution bug; per-slice global validate would kill the swarm.
- Not a replacement for the proposals plugin. The proposals
  state machine is the source of truth for slice transitions; the
  settlement model is an outer orchestration layer.

## Where the code lives

- `commit-policy/src/lib/settlement/`: settlement gate, worker
  registry, settlement-tool. (q00015 S2)
- `quality-policy/src/lib/settlement-runner.ts`: full-validate
  loop with bounded retries. (q00015 S3)
- `proposals/src/lib/auto-work/repair-mode.ts`: repair agent that
  emits slices for failing files. (q00015 S4)
- `tests/e2e/eventual-settlement.spec.ts`: end-to-end cycle test.
  (q00015 S5)
