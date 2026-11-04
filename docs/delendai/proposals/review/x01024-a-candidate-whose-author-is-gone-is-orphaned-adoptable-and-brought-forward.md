---
id: x01024
title: "A candidate whose author is gone is orphaned, adoptable and brought forward"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-11-04
last-transition-id: 7f2e6c02-691a-47dd-b42d-7406ec306e66
last-correlation-id: 7f2e6c02-691a-47dd-b42d-7406ec306e66
last-transition-from: in-progress
last-transition-at: 2026-11-04T09:33:06.573Z
---

# x01024 — A candidate whose author is gone is orphaned, adoptable and brought forward

## goal

A publication or unit whose author is gone becomes an explicit orphaned state: shown, adoptable by anyone, kept moving by the hydrator and reported to the owner, never stranded.

## why

External audit (ChatGPT, 2026-11-04, against develop f7f53bf8d), finding 6, refined by the owner. Claim: a candidate handed back to its author (`candidate-disposition.ts`, disposition `author`: red again after being brought forward, `its author pushes next`; `authorsOwn` at line 136) stays stranded forever when the author is gone. Verified by reading `tools/scripts/forge/candidate-disposition.ts`: the `author` branch has no notion of the author being alive, so nothing ever hands the candidate to anyone else. (The audit cites line 98; the branch is at about that line and `authorsOwn` at 136.) Not reproduced. The audit also asks `work status` to show, per open publication, how far behind it is, the overlap, its age and whether its owner is alive.

## non-goals

- Discarding any tip: retire keeps them.

## slices

- global_gate: none

### S1 — Orphaned is detected from heartbeats and the lease
- **Status**: pending
- **Files**: `tools/scripts/forge/candidate-disposition.ts`, `tools/scripts/forge/candidate-disposition.interface.ts`, `packages/core/src/lib/work-units/orphaned-work.service.ts`, `packages/core/src/lib/contracts/interfaces/orphaned-work.interface.ts`, `packages/core/src/lib/work-units/unit-lease.interface.ts`, `packages/core/src/lib/work-units/unit-lease.service.ts`, `packages/core/src/lib/work-units/unit-standings.service.ts`
- **Gate**: type
- acceptance:
  - "A publication or unit is orphaned when its author is gone: finished, idle past the recovery window, or out of quota, meaning no heartbeat and no live session holding its lease. A candidate whose author still has a heartbeat or a live lease stays disposition author. Specs: author alive, author idle past the window, author finished, author out of quota."
- shipped-in: `f4b76a89b021`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — Rework required: this slice currently lacks attached reproducible current-develop evidence for the orphan-detection criteria (alive/idle/finished/out-of-quota cases and lease/heartbeat interplay). Please re-run and submit fresh empirical proof for each acceptance case.

### S2 — Orphaned units are listed with their reason
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-status.service.ts`
- **Gate**: type
- acceptance:
  - "work status and work swarm list every orphaned unit with the reason and the time since its last beat, in every project, not only this one. Spec: a roster with one live and one orphaned unit lists only the orphaned one as orphaned."
- shipped-in: `f4b76a89b021`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — Rework required: this slice currently lacks attached reproducible evidence on current develop for orphan listing behavior in `work status`/`work swarm` (reason + time-since-last-beat, cross-project scope). Please re-run and attach fresh proof.

### S3 — Any agent can take an orphan over
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/unit-adoption.service.ts`, `packages/core/src/lib/work-units/work-unit-claim.service.ts`
- **Gate**: type
- acceptance:
  - "An agent takes an orphaned unit over with the existing claim or adopt path; the record says it changed hands and from whom, and the unit returns to its normal state once adopted. Spec: adopt, then the unit is no longer orphaned and its history names both agents."
- shipped-in: `e26e5a73eaa1`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — Rework required: this slice currently lacks attached reproducible evidence on current develop for orphan adoption flow (handover attribution/history and return to normal state). Please re-run and resubmit with empirical proof.

### S4 — The hydrator keeps an orphan moving, bounded
- **Status**: pending
- **Files**: `tools/scripts/git/orphan-rescue.ts`, `tools/scripts/git/refresh-candidate-artifacts.script.ts`, `packages/core/src/lib/contracts/constants/orphaned-work.constant.ts`, `packages/core/src/runtime/index.ts`
- **Gate**: type
- acceptance:
  - "While a candidate is orphaned the hydrator keeps bringing it forward, at most N attempts; after N failed attempts the owner is told, once, and no tip is lost (retire keeps it). Specs: attempts below N continue, the Nth failure reports, an adopted candidate is no longer touched as an orphan."
- shipped-in: `f4b76a89b021`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — Rework required: shipped-in f4b76a89b021 is stale for this slice. `git log f4b76a89b021..develop -- <S4 files>` shows post-shipped changes in listed files (e.g. eb955b9f4, dad2196b0), so the hydrator/orphan-rescue acceptance must be re-validated on current develop with fresh evidence.

### S5 — work status shows branch staleness and integration risk
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/work-unit-status.service.ts`
- **Gate**: type
- acceptance:
  - "work status prints one line per open publication with: commits behind develop, overlap with other open publications, age, and whether its owner is alive. Spec: a publication behind by 3 with one overlapping file prints those numbers."
- shipped-in: `f4b76a89b021`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- A publication or unit is orphaned when its author is gone: finished, idle past the recovery window, or out of quota, meaning no heartbeat and no live session holding its lease. A candidate whose author still has a heartbeat or a live lease stays disposition author. Specs: author alive, author idle past the window, author finished, author out of quota.
- work status and work swarm list every orphaned unit with the reason and the time since its last beat, in every project, not only this one. Spec: a roster with one live and one orphaned unit lists only the orphaned one as orphaned.
- An agent takes an orphaned unit over with the existing claim or adopt path; the record says it changed hands and from whom, and the unit returns to its normal state once adopted. Spec: adopt, then the unit is no longer orphaned and its history names both agents.
- While a candidate is orphaned the hydrator keeps bringing it forward, at most N attempts; after N failed attempts the owner is told, once, and no tip is lost (retire keeps it). Specs: attempts below N continue, the Nth failure reports, an adopted candidate is no longer touched as an orphan.
- work status prints one line per open publication with: commits behind develop, overlap with other open publications, age, and whether its owner is alive. Spec: a publication behind by 3 with one overlapping file prints those numbers.
