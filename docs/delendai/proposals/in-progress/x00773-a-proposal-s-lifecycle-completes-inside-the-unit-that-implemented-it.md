---
id: x00773
title: "A proposal's lifecycle completes inside the unit that implemented it"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-09-30
last-transition-id: ca921ca2-3e3d-4f98-9e47-b65bd4be0dbe
last-correlation-id: ca921ca2-3e3d-4f98-9e47-b65bd4be0dbe
last-transition-from: ready
---

# x00773 — A proposal's lifecycle completes inside the unit that implemented it

## Goal

An agent that creates a proposal and implements it in a work unit can hand it to review, and move its slices, from that unit, under every profile: the transition is written in the unit's tree, rides with the pull request or the merge, and lands directly under a direct profile.

## why

Proposals sit in ready with slices pending after their PR is published, because the hand-off needs the file on the integration branch and agents edit statuses by hand.

## non-goals

- TODO: what this proposal deliberately skips.

## Slices

- global_gate: none

### S1 — Hand-off from the unit
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
- **Gate**: type

## acceptance

- TODO: observable acceptance criteria.
