---
id: x00647
title: "A test does not expire with the calendar"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-25
priority: P0
related: [x00637]
last-transition-id: 6a54fbd4-4e25-4fbf-bdcc-48b8e8e4796f
last-correlation-id: 6a54fbd4-4e25-4fbf-bdcc-48b8e8e4796f
last-transition-from: in-progress
---

# x00647 — A test does not expire with the calendar

## goal

The integration branch's certification does not turn red because a date
passed.

## why

On 2026-09-25 the full run certifying `develop` at `f99521d1b` failed on
`project-kpis`' `kpi-history.spec.ts` and the queue stopped behind it
(x00637 S3 arms nothing on an uncertified tip). The same spec fails at
every earlier merge that had been certified green: nothing in the code
changed. The test writes snapshots dated 2026-08-26 to 2026-08-29 and
reads them with a fixed `now`, but its four `persistKpiSnapshotHistory`
calls let persistence prune with the real clock; 2026-09-25 is thirty
days after 2026-08-26, so from that day on the oldest snapshot is pruned
at write time and the read sees three entries instead of four.

## why this design

The persistence already takes `now`; every other call in the spec
passes it. The failing test's calls now do too, so the test's dates are
the only clock it reads.

## non-goals

- Changing the retention behaviour.

## architecture

`plugins/project-kpis/tests/src/kpi-history.spec.ts`: `now` on every
`persistKpiSnapshotHistory` call (9 of 9).

## Slices

- global_gate: none

### S1 — The history spec reads only its own clock

- **Status**: review
- **Gate**: `npx vitest run plugins/project-kpis`
- **Files**: `plugins/project-kpis/tests/src/kpi-history.spec.ts`
- review-state: in_review
- review-implementer: claude-opus-5-5
## dependency graph

None.

## acceptance

- `kpi-history.spec.ts` passes on any date.
- Every `persistKpiSnapshotHistory` call in it passes `now`.

## risks and mitigations

- **Other specs with the same shape.** This one was found by the
  certification run; others will surface the same way, and the fix is the
  same.

## notes

While `develop` is red the queue arms nothing, including this fix, so it
has to be merged by the owner.
