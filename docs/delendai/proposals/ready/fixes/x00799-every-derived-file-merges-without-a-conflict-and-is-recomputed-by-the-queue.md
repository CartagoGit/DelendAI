---
id: x00799
title: "Every derived file merges without a conflict and is recomputed by the queue"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-10-01
---

# x00799 — Every derived file merges without a conflict and is recomputed by the queue

## Goal

Two branches that each add a proposal, an export, a tool or a guide merge into develop without a conflict on any derived file, and a branch brought forward by the queue is never left with a stale one.

## why

Measured on 2026-10-01 over PRs 689, 691, 692/696, 700/705: each needed two or three re-merge rounds on the inventory, the docs index, the agent catalog, TOKEN-BUDGETS.md, preset-metadata.generated.ts and the plugins' tool-outputs.ts. x00559 and x00576 built a merge driver but routed only the files that existed then; every generator added since sits outside the table and nothing fails when a generator is added without a route. The driver also keeps OURS and regenerates, so for a hand-written file with a generated block (the bootstrap, the docs index) it silently drops THEIRS' prose. And gen:all, which the queue's refresh runs after merging, does not run docs:index or types:generate, so the refresh returns those two stale.

## non-goals

- Committing fewer artefacts: the docs, the typed tool outputs and the inventory are read from git by people, the web app and the build.
- Changing any generator's output bytes.
- Making the forge's own merge ref run a driver: it cannot, which is why the queue regenerates.

## Slices

- global_gate: none

### S1 — Every gen:all step is routed to the driver, block files merge their prose, and gen:all covers docs:index and types:generate
- **Status**: pending
- **Files**: `tools/scripts/git/generated-merge-driver.constant.ts`, `tools/scripts/git/generated-merge-driver.interface.ts`, `tools/scripts/git/generated-merge-driver.script.ts`, `tools/scripts/git/generated-merge-driver.script.spec.ts`, `tools/scripts/gen-all.script.ts`, `tools/scripts/gen-all.spec.ts`, `.gitattributes`
- **Gate**: none

## acceptance

- TODO: observable acceptance criteria.
