---
id: x01110
title: "Bot-filed issues: one per kind, closed when cleared, and the watchdog names the event it missed"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-11-21
last-transition-id: 8c7d0cc8-5d6c-4ee9-b992-906d045fac7a
last-correlation-id: 8c7d0cc8-5d6c-4ee9-b992-906d045fac7a
last-transition-from: ready
last-transition-at: 2026-11-21T01:57:18.687Z
---

# x01110 — Bot-filed issues: one per kind, closed when cleared, and the watchdog names the event it missed

## goal

The slow rebrand spec leaves the unit tier; the land watchdog stops reporting a pass that raced a live event or crashed as a missed event and names the evidence; every bot issue writer keeps one open issue per kind and closes it itself.

## why

#3269: rebrand-propagate.spec.ts takes 5312 ms because one test scans the whole repo through a spawned bun (4.7 s). #3024 and #2763: the schedule pass runs in its own concurrency group, so it ran beside the event-driven pass for the same PR (run 44303682762: both merged #3022 at the same second, the dispatch having started at 12:25:15) and the watchdog called that a missed event; run 44091833385 was a crash (exit 5, POST pulls returned no body) filed as a missed event through failure(). land.yml and test-budget-calibration.yml run gh issue create on every occurrence, so duplicates pile up and nothing closes them.

## non-goals

- Changing what land merges or batches
- Changing the error-reporting plugin cooldown
- Closing or editing the existing issues by hand

## slices

- global_gate: none

### S1 — Split the live repo scan out of the unit spec
- **Status**: pending
- **Files**: `tools/scripts/migrate/rebrand-propagate.spec.ts`, `tools/scripts/migrate/rebrand-propagate.live.e2e.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "tools/scripts/migrate/rebrand-propagate.live.e2e.spec.ts: [<10000ms] passes on the real repo (live brand propagation is clean)"
  - "tools/scripts/migrate/rebrand-propagate.spec.ts: the file holds no scan of the real repository, so it stays under 5000 ms"

### S2 — One upsert for bot issues
- **Status**: pending
- **Files**: `tools/scripts/ci/upsert-issue.ts`, `tools/scripts/ci/upsert-issue.script.ts`, `tools/scripts/ci/upsert-issue.spec.ts`, `.github/workflows/test-budget-calibration.yml`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "tools/scripts/ci/upsert-issue.spec.ts: opening with no open issue of the title creates one"
  - "tools/scripts/ci/upsert-issue.spec.ts: opening with an open issue edits its body and closes duplicates of the same title"
  - "tools/scripts/ci/upsert-issue.spec.ts: clearing closes every open issue of the title with a comment and creates nothing"
  - "tools/scripts/ci/upsert-issue.spec.ts: the calibration workflow writes its issue through the upsert script and never gh issue create"

### S3 — The watchdog names the missed event and no longer cries wolf
- **Status**: pending
- **Files**: `plugins/integration/src/lib/services/integration-pass.service.ts`, `plugins/integration/tests/src/lib/services/integration-pass.service.spec.ts`, `packages/core/src/lib/integration/land/land-workflow.helper.ts`, `packages/core/src/lib/integration/land/land-watchdog-steps.helper.ts`, `packages/core/src/lib/integration/land/land-watchdog.constant.ts`, `plugins/integration/src/lib/contracts/interfaces/integration-pass.interface.ts`, `.github/workflows/land.yml`, `tools/scripts/forge/land-workflow.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "plugins/integration/tests/src/lib/services/integration-pass.service.spec.ts: a watchdog pass that acted writes evidence naming the sha, the event and each pull request it merged"
  - "tools/scripts/forge/land-workflow.spec.ts: the watchdog runs strict only when no event-driven land run is in flight, and a crashed pass does not file a missed-event issue"
  - "tools/scripts/forge/land-workflow.spec.ts: the watchdog issue is kept as one open issue (edited, duplicates closed) and closed by a clean scheduled pass"

## acceptance

- tools/scripts/migrate/rebrand-propagate.live.e2e.spec.ts: [<10000ms] passes on the real repo (live brand propagation is clean)
- tools/scripts/migrate/rebrand-propagate.spec.ts: the file holds no scan of the real repository, so it stays under 5000 ms
- tools/scripts/ci/upsert-issue.spec.ts: opening with no open issue of the title creates one
- tools/scripts/ci/upsert-issue.spec.ts: opening with an open issue edits its body and closes duplicates of the same title
- tools/scripts/ci/upsert-issue.spec.ts: clearing closes every open issue of the title with a comment and creates nothing
- tools/scripts/ci/upsert-issue.spec.ts: the calibration workflow writes its issue through the upsert script and never gh issue create
- plugins/integration/tests/src/lib/services/integration-pass.service.spec.ts: a watchdog pass that acted writes evidence naming the sha, the event and each pull request it merged
- tools/scripts/forge/land-workflow.spec.ts: the watchdog runs strict only when no event-driven land run is in flight, and a crashed pass does not file a missed-event issue
- tools/scripts/forge/land-workflow.spec.ts: the watchdog issue is kept as one open issue (edited, duplicates closed) and closed by a clean scheduled pass
