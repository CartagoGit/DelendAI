---
id: d00418
title: "Every agent works by the product principles"
kind: docs
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-11-04
last-transition-id: 8adf7b6e-2ec3-4b4c-87be-986f0ffe4b3b
last-correlation-id: 8adf7b6e-2ec3-4b4c-87be-986f0ffe4b3b
last-transition-from: ready
last-transition-at: 2026-11-04T04:53:20.477Z
---

# d00418 — Every agent works by the product principles

## goal

Every agent in this repository, on any host and model, reads the owner's product principles in the bootstrap and decides by them when unsure.

## why

On 2026-11-04 the owner set standing product principles for every agent in this repository, not for one session: efficiency, robustness, speed, token saving, ease of use, and above all a fully agnostic product, so that delendai works as a layer in any project, with any agent and host, without agents going off the rails. Agents read only the bootstrap as their rules (every host file points to it), so the principles belong there. That day's defects (checks not sectioned, branches stranded when their author left, maintenance running only in this repository, a host-specific MCP assumption) are each a breach of one of them.

## non-goals

- Restating the workflow rules, which already have their own sections.

## slices

- global_gate: none

### S1 — The principles are in the bootstrap
- **Status**: pending
- **Files**: `docs/delendai/AGENT-BOOTSTRAP.md`
- **Gate**: none
- acceptance:
  - "AGENT-BOOTSTRAP.md states the product principles in one short section before the workflow, and stays within its size budget."

## acceptance

- AGENT-BOOTSTRAP.md states the product principles in one short section before the workflow, and stays within its size budget.
