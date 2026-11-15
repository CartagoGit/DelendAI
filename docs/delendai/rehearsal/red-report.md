# Rehearsal report: the pull request flow against today's land

Run `r20261113-001246` on `CartagoGit/DelendAI`, fast mode, develop tip `fbaa7b8a6431`.
Started 2026-11-13T00:12:46Z, finished 00:58:46Z (46 minutes). The full evidence is in
[`red-report.json`](red-report.json). The integrator is today's land workflow, rendered by
`renderLandWorkflow` with the rehearsal branch as its integration branch, the rehearsal CI as the
required check and its own concurrency group; it ran in Actions with the workflow token.

Result: **RED**. 1 of 11 scenarios is green. 12 synthetic pull requests were opened by the harness,
plus 1 opened by the token workflow. Cleanup closed every pull request and deleted every branch
and label it knew of; one branch (`delendai/rehearsal/token-open-1930`) fell outside the run's
root because of a harness defect (below) and was deleted by hand afterwards. 0 rehearsal branches
and 0 open rehearsal pull requests remain. Nothing was written to develop or main.

## Scenarios

| Scenario | Reproduces | Verdict | Observed cause |
|---|---|---|---|
| one-pr | F2, F7, F9 | RED | Not merged in 360 s; the harness had to wake the integrator; a later wake was refused by GitHub (`convertPullRequestToDraft` permission); the integration branch never moved, so no push-started scan |
| non-overlapping | | RED | Neither pull request merged in 360 s; 4 wakes were needed (CI completion wakes nothing from a non-default branch) |
| overlapping | F5 | RED | Neither merged; no batch was opened (0 CI runs after the members' own); 4 wakes |
| red-batch | | RED | The failing pull request was never labelled `culprit` and the good one never merged; 2 wakes |
| derived-conflict | | RED | Not merged in 360 s; 2 wakes |
| authored-conflict | F3, F4 | RED | Labelled `needs-update` once with no flip (the F3 check passed, with no manual step before the label), but never merged after the author update, and a wake was refused by GitHub (`convertPullRequestToDraft` permission) |
| bot-head | F1 | RED | The head the workflow token pushed (`c4bd54ae06ca`) started no CI |
| develop-moving | | GREEN | Merged by land, no manual step (unexpected: it was on the known-red list) |
| host-offline | F8 | RED | No session receiver ran, so nobody was told |
| automation-opened | F1b | RED | The harness did not find the pull request the workflow opened (harness defect, below), so no head could be checked |
| promotion | | RED | The integration branch never moved, so nothing was built or scanned |

## Targets

| Target | Value | Threshold | Verdict |
|---|---|---|---|
| PR to merged, p50 | 0.58 min (2 of 12 merged) | 15 min | met |
| PR to merged, p95 | 10 pull requests never merged | 30 min | MISSED |
| One CI per overlapping group | 0 | 1 | MISSED |
| Zero manual steps | 13 wakes | 0 | MISSED |
| Session notified, p95 | no receiver | 10 s | MISSED |
| Integration branch scanned | 3 of 7 merged tips (0.43) | 1.0 | MISSED |
| No secrets in logs | 1 "hit" (a log that could not be read) | 0 | MISSED (a harness defect, below) |

## Known red list (may only shrink; activation requires it empty)

See `plugins/integration/src/lib/contracts/constants/rehearsal-known-red.constant.ts`. This run
confirms every entry except `develop-moving`, which was green once. F6 is real-mode only and has
no fast scenario.

## Harness defects found by this run, fixed in the same unit afterwards (the figures above are from before the fixes)

1. The token workflow opened its branch under `<namespace>/rehearsal/` instead of the run's own
   root. The harness never found the pull request (F1b shows red for that reason, not as a
   measurement) and cleanup missed the branch. Fixed: the run's root is passed, with a spec.
2. A run that never started a job has no log, and reading it was counted as a secret hit. Fixed:
   a missing log is an empty log, with a spec.
3. Two woken pull requests failed `convertPullRequestToDraft` with a GitHub permission error
   (`CartagoGit does not have permission to convert the pull request to draft`). The wake
   still worked on the other pull requests, so the cause is not settled; later slices should
   avoid needing it.
4. An earlier attempt of this run died on a history read and a prior one on the branch-namespace
   ruleset; both are fixed and covered by specs.
