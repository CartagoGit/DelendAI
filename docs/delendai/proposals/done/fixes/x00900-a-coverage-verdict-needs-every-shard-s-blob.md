---
id: x00900
title: "a coverage verdict needs every shard's blob"
kind: fix
status: done
type: proposal
track: general
date: 2026-10-14
last-transition-id: 47cbf78a-63dd-4820-ba02-9ed15fbb33fc
last-correlation-id: 47cbf78a-63dd-4820-ba02-9ed15fbb33fc
last-transition-from: review
last-transition-at: 2026-10-14T15:53:54.384Z
shipped-in:
  - "84b94f05b"
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

- **Status**: done
- **Files**:
  - `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - Before merging, the `tests` job checks that every zone the plan ran left `blob-<slug>.json`. On a re-run (`run_attempt > 1`), a missing one fails the job naming the zones and saying to re-run all jobs. On a first attempt, where a zone that selected no spec may write none, it warns and goes on as before.
- shipped-in: `84b94f05b500`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 84b94f05b, validate exit 0, tests 1/1; acceptance 1/1: (1) All three branches are implemented literally in the merge job (.github/workflows/ci.yml:736-758, `if: steps.planned.outputs.none != 'true'`). It iterates `jq -… — Delivered by 84b94f05b (PR #1086 merge), the only candidate touching the single declared file. Gate `type`. A CI-workflow criterion cannot be proven by a unit test — it is proven by reading the three branches and confirming each does what it says — so I checked all three separately and confirmed the premise the whole check rests on. The step "Check that every zone that ran left its blob" runs under `if: steps.planned.outputs.none != 'true'`, i.e. in the merge job before merging, and iterates `jq -r '.[] | select(.run) | .name'` so it covers exactly the zones the plan ran and not zones that were planned-but-skipped. The slug is derived the same way the upload names it (`printf '%s' "$zone" | tr -c 'A-Za-z0-9' '-'`), so the check and the producer cannot disagree about a filename. The three outcomes the criterion names are all present and distinct: a complete run exits 0 silently; on a re-run `[ "$ATTEMPT" -gt 1 ]` emits `::error::coverage cannot be judged: this re-run has no blob for:${missing}. The blobs of the first attempt were dropped after it merged them. Re-run all jobs, not only the failed ones.` and `exit 1` — naming the zones AND the remedy, which is the whole point of the criterion; and a first attempt falls through to `::warning::no blob from:${missing} (a zone that selected no spec writes none).` with no exit, so it goes on as before. The premise is the part worth double-checking, because a check for missing blobs is worthless if the producer can skip: the upload step is `if: matrix.zone.run` with no `success()` condition, so it runs whatever the outcome of the test step, and carries `if-no-files-found: error`. The workflow's own comment (:728-735) records the incident that motivated it — #1083 failed at 31% changed-file coverage for code the full suite covers at over 90%, because re-running only the failed shard merged that shard's report with nothing else — which is precisely the failure this check refuses. `.github/workflows/ci.yml` parses as valid YAML.

## acceptance

- A re-run of failed jobs never produces a coverage verdict from part of the suite.
