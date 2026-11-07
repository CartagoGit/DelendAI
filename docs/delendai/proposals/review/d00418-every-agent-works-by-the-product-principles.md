---
id: d00418
title: "Every agent works by the product principles"
kind: docs
status: review
type: proposal
track: a00095-consistency
date: 2026-11-04
last-transition-id: f725bd6c-236e-40c6-85a2-f0b87d2e7978
last-correlation-id: f725bd6c-236e-40c6-85a2-f0b87d2e7978
last-transition-from: in-progress
last-transition-at: 2026-11-04T04:57:34.252Z
shipped-in:
  - "8d323ec13038"
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
- **Status**: done
- **Files**: `docs/delendai/AGENT-BOOTSTRAP.md`
- **Gate**: none
- acceptance:
  - "AGENT-BOOTSTRAP.md states the product principles in one short section before the workflow, and stays within its size budget."
- shipped-in: `502cf5a86e62`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.3-codex
- review-log: approved by gpt-5.3-codex — verified at 8d323ec13038, validate exit 0 and tests 10/10 claimed, no recorded run cited; acceptance 1/1: (1) Commit 8d323ec13038 updates docs/delendai/AGENT-BOOTSTRAP.md as declared; bootstrap-canonical.script.spec.ts passed (10/10), including lintBootstrapFromDisk ze…

## acceptance

- AGENT-BOOTSTRAP.md states the product principles in one short section before the workflow, and stays within its size budget.
