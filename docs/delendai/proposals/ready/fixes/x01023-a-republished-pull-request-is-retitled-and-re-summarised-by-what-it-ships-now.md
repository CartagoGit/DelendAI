---
id: x01023
title: "A republished pull request is retitled and re-summarised by what it ships now"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-11-04
---

# x01023 — A republished pull request is retitled and re-summarised by what it ships now

## goal

On every republish, work publish sets the pull request title and summary to match the final diff and the slices it ships.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — Publish updates the text of an open pull request
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/publication-pull-request.service.ts`
- **Gate**: type
- acceptance:
  - "When the publication's pull request is already open, work publish rewrites its title and summary from the final diff and the slices the unit now ships, through the REST API, and reports the change; a spec covers a unit whose scope shrank between two publishes."

## acceptance

- When the publication's pull request is already open, work publish rewrites its title and summary from the final diff and the slices the unit now ships, through the REST API, and reports the change; a spec covers a unit whose scope shrank between two publishes.
