---
id: f00757
title: "Token and coordination cost cut where the 2026-10-07 audit measured it"
kind: feat
status: ready
type: proposal
track: tokens
date: 2026-10-06
---

# f00757 — Token and coordination cost cut where the 2026-10-07 audit measured it

## goal

Cut what an agent pays per call and what a swarm pays per landed slice, by measurement: proposals tools in lazy capability packs, publications that carry their regenerated views, compact views of large plans, and the swarm's coordination cost and each tool's output size measured. From the external audit of the second review swarm (ChatGPT, 2026-10-07, .cache/chat-with-llms/2026_10_07_01:08_…), triaged against the code: its swarm-residue and upgrade findings are already x00875, x00877 and x00878; these are the ones nothing covered.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — The proposals plugin loads its tools in capability packs
- **Status**: pending
- **Files**: `plugins/proposals/src/index.ts`, `plugins/proposals/plugin.manifest.ts`
- **Gate**: type
- acceptance:
  - "The proposals tools are registered in packs (read, author, review, work, repair) that the managed surface activates on first use; a session that only reads proposals pays for no author, review or repair schema."
  - "The tools/list bytes of a read-only session, measured before and after, are recorded in TOKEN-BUDGETS.md."

### S2 — A publication carries its regenerated views in the same commit
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-publish.service.ts`
- **Gate**: type
- acceptance:
  - "work publish regenerates the derived views it knows (agent catalog, token budgets, agent instructions) and commits them with the work, so two publications do not go stale against each other and no separate chore(generated) commit follows."

### S3 — A plan document has a generated compact view
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/proposals/proposal-summaries.service.ts`
- **Gate**: type
- acceptance:
  - "Each plan or proposal over a size threshold has a generated view of its open slices, dependencies and remaining acceptance, and work enter and the review brief read that view instead of the whole document."

### S4 — The coordination cost of a swarm is measured
- **Status**: pending
- **Files**: `plugins/project-kpis/src/index.ts`
- **Gate**: type
- acceptance:
  - "A swarm-run summary records agents, units, accepted slices, invalid verdicts, orphans left, manual interventions and coordination_tax = (merge + generated + bookkeeping commits) / all commits, and the KPI shows its trend across runs."

### S5 — Tool output size is measured per tool
- **Status**: pending
- **Files**: `plugins/usage-tracking/src/index.ts`
- **Gate**: type
- acceptance:
  - "Each tool call records its output bytes; p50, p95 and p99 per tool appear in the KPIs, so the tools worth an artifact handle or a compact default are chosen by measurement."

## acceptance

- The proposals tools are registered in packs (read, author, review, work, repair) that the managed surface activates on first use; a session that only reads proposals pays for no author, review or repair schema.
- The tools/list bytes of a read-only session, measured before and after, are recorded in TOKEN-BUDGETS.md.
- work publish regenerates the derived views it knows (agent catalog, token budgets, agent instructions) and commits them with the work, so two publications do not go stale against each other and no separate chore(generated) commit follows.
- Each plan or proposal over a size threshold has a generated view of its open slices, dependencies and remaining acceptance, and work enter and the review brief read that view instead of the whole document.
- A swarm-run summary records agents, units, accepted slices, invalid verdicts, orphans left, manual interventions and coordination_tax = (merge + generated + bookkeeping commits) / all commits, and the KPI shows its trend across runs.
- Each tool call records its output bytes; p50, p95 and p99 per tool appear in the KPIs, so the tools worth an artifact handle or a compact default are chosen by measurement.
