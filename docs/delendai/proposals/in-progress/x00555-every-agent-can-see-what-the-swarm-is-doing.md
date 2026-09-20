---
id: x00555
title: "Every agent can see what the swarm is doing"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-19
tags:
    - swarm
    - coordination
    - claims
    - awareness
---

# x00555 — Every agent can see what the swarm is doing

## goal

Before an agent starts, it can see what every other agent is working on,
which paths are already claimed, and which proposals are in flight — so
two agents never solve the same thing twice, and never solve it in ways
that undo each other.

## why

The system already records almost all of it: leases, path claims, work
units, generations and their checkpoints all live in the operational
state. What is missing is that **nothing shows it to an agent at the
moment it decides what to do**. A boot prints a verdict; the claims are
consulted only when a write is attempted, which is after the work exists.

The result is what the swarm was supposed to prevent: an agent picks a
file another agent is mid-way through, or re-implements something that
is already three commits into another work ref, and the collision is
discovered at commit time, when the cheap options are gone.

A hive is not twenty agents each holding a lock. It is twenty agents
that can read the same picture before they move.

## non-goals

- **No new store.** Everything read here is already recorded; this is a
  view, not another source of truth.
- **No blocking.** Awareness is not a lock: the claims system stays the
  enforcement, this is what stops the collision from being created in
  the first place.
- **No personal data.** Agents are identified by the agent id the
  project already uses, never by machine or user identity.

## slices

### S1 — One view of the swarm, read from the state that exists

- **Status**: done — `delendai work swarm` answers, from git alone and
  with no MCP server: every unit of work anyone has published, the
  identity its ref carries, how far it is from the integration branch
  both ways, and — the part that avoids the collision rather than
  detecting it — which paths more than one unit of work is changing. Git
  was the right source: it is the one thing every clone in a swarm
  shares, while the operational database describes one machine.
- **Gate**: `npx vitest run packages/cli/src/lib/work-swarm.service.spec.ts`
- **Files**: `packages/cli/src/commands/work.command.ts`, `packages/proposals-sqlite/src/lib/work-model/**`
- `delendai work swarm` (and the equivalent MCP surface) answers: who
  holds which live claims, which work units have unmerged checkpoints,
  which proposals are in flight, and which publication refs are open —
  offline, from the operational state.

### S2 — A collision is named before the work starts

- **Status**: pending
- **Gate**: `npx vitest run packages/cli/src/commands/work.command.spec.ts`
- **Files**: `packages/cli/src/commands/work.command.ts`, `packages/proposals-sqlite/src/lib/work-model/**`
- Claiming or checkpointing paths that overlap another live claim
  reports the other agent, its work unit and the overlapping paths, with
  the choices (wait, re-scope, or take it over with proof) instead of a
  bare refusal.

### S3 — The picture reaches the agent that needs it

- **Status**: pending
- **Gate**: `npx vitest run packages/cli/src/commands/work.command.spec.ts`
- **Files**: `packages/cli/src/commands/work.command.ts`, `packages/proposals-sqlite/src/lib/work-model/**`
- The swarm view is part of what an agent reads when it starts a unit of
  work, so "what is everyone else doing" is answered before the first
  edit rather than after the first conflict.

## acceptance

- One command answers who holds which claims, which work units carry
  unmerged checkpoints and which publication refs are open, offline.
- Claiming paths that overlap another live claim names the other agent,
  its work unit and the overlapping paths.
- That picture is available before the first edit, not after the first
  conflict.

