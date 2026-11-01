---
id: v00153
title: "the MCP server answers initialize inside any client's connect window"
kind: perf
status: ready
type: proposal
track: ci
date: 2026-11-01
---

# v00153 — the MCP server answers initialize inside any client's connect window

## goal

A client connecting to the server gets its answer in seconds on a repository with years of history, so an agent never loses the tools to a connect timeout.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — S1
- **Status**: pending
- **Files**: `packages/core/src/lib/startup-reconciler/phases/integration-evidence.ts`, `packages/core/src/lib/startup-reconciler/git-seam.ts`, `packages/core/src/lib/startup-reconciler/seams.interface.ts`
- **Gate**: none

## acceptance

- TODO: observable acceptance criteria.
