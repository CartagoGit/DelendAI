---
id: x01024
title: "A candidate whose author is gone is orphaned, adoptable and brought forward"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-04
---

# x01024 — A candidate whose author is gone is orphaned, adoptable and brought forward

## goal

A publication or unit whose author is gone becomes an explicit orphaned state: shown, adoptable by anyone, kept moving by the hydrator and reported to the owner, never stranded.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — Orphaned is detected from heartbeats and the lease
- **Status**: pending
- **Files**: `tools/scripts/forge/candidate-disposition.ts`
- **Gate**: type
- acceptance:
  - "A publication or unit is orphaned when its author is gone: finished, idle past the recovery window, or out of quota, meaning no heartbeat and no live session holding its lease. A candidate whose author still has a heartbeat or a live lease stays disposition author. Specs: author alive, author idle past the window, author finished, author out of quota."

### S2 — Orphaned units are listed with their reason
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-swarm.service.ts`
- **Gate**: type
- acceptance:
  - "work status and work swarm list every orphaned unit with the reason and the time since its last beat, in every project, not only this one. Spec: a roster with one live and one orphaned unit lists only the orphaned one as orphaned."

### S3 — Any agent can take an orphan over
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/unit-adoption.service.ts`
- **Gate**: type
- acceptance:
  - "An agent takes an orphaned unit over with the existing claim or adopt path; the record says it changed hands and from whom, and the unit returns to its normal state once adopted. Spec: adopt, then the unit is no longer orphaned and its history names both agents."

### S4 — The hydrator keeps an orphan moving, bounded
- **Status**: pending
- **Files**: `tools/scripts/git/hydrate-candidates-after-merge.script.ts`
- **Gate**: type
- acceptance:
  - "While a candidate is orphaned the hydrator keeps bringing it forward, at most N attempts; after N failed attempts the owner is told, once, and no tip is lost (retire keeps it). Specs: attempts below N continue, the Nth failure reports, an adopted candidate is no longer touched as an orphan."

### S5 — work status shows branch staleness and integration risk
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-status.service.ts`
- **Gate**: type
- acceptance:
  - "work status prints one line per open publication with: commits behind develop, overlap with other open publications, age, and whether its owner is alive. Spec: a publication behind by 3 with one overlapping file prints those numbers."

## acceptance

- A publication or unit is orphaned when its author is gone: finished, idle past the recovery window, or out of quota, meaning no heartbeat and no live session holding its lease. A candidate whose author still has a heartbeat or a live lease stays disposition author. Specs: author alive, author idle past the window, author finished, author out of quota.
- work status and work swarm list every orphaned unit with the reason and the time since its last beat, in every project, not only this one. Spec: a roster with one live and one orphaned unit lists only the orphaned one as orphaned.
- An agent takes an orphaned unit over with the existing claim or adopt path; the record says it changed hands and from whom, and the unit returns to its normal state once adopted. Spec: adopt, then the unit is no longer orphaned and its history names both agents.
- While a candidate is orphaned the hydrator keeps bringing it forward, at most N attempts; after N failed attempts the owner is told, once, and no tip is lost (retire keeps it). Specs: attempts below N continue, the Nth failure reports, an adopted candidate is no longer touched as an orphan.
- work status prints one line per open publication with: commits behind develop, overlap with other open publications, age, and whether its owner is alive. Spec: a publication behind by 3 with one overlapping file prints those numbers.
