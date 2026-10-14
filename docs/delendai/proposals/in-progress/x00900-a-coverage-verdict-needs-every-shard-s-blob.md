---
id: x00900
title: "a coverage verdict needs every shard's blob"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-14
---

# x00900 — a coverage verdict needs every shard's blob

## goal

The CI `tests` job judges changed-file coverage only from a merge of every shard that ran. On a re-run whose blobs are not all there, it fails with the cause and the remedy, not with a coverage verdict about a fraction of the suite.

## why

On 2026-10-14 the plugins 3/3 shard of #1083 failed on a temporary-directory race (`ENOTEMPTY ... rmdir`) unrelated to the change. Re-running the failed jobs ran that shard again and the `tests` job, which merged its one blob with nothing else: the step that drops the shard blobs runs `if: always()`, so the first attempt had already deleted the others. The gate then reported `changed-file-coverage: FAIL` at 31.84% statements, for files the full core suite covers at 91.8%. The verdict looked like a real coverage gap and cost an investigation. Dropping the blobs is right: a night of CI once filled the artifact quota and failed every shard. Merging what is left as if it were the whole is not.

## non-goals

- Keeping blobs for re-runs: the quota that made the drop necessary still applies.

## slices

- global_gate: type

### S1 — The tests job refuses a merge with a zone's blob missing on a re-run

- **Status**: in-progress
- **Files**:
  - `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - Before merging, the `tests` job checks that every zone the plan ran left `blob-<slug>.json`. On a re-run (`run_attempt > 1`), a missing one fails the job naming the zones and saying to re-run all jobs. On a first attempt, where a zone that selected no spec may write none, it warns and goes on as before.

## acceptance

- A re-run of failed jobs never produces a coverage verdict from part of the suite.
