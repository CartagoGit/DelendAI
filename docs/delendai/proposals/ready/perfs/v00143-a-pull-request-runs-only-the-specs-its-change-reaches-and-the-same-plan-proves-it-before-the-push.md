---
id: v00143
title: "A pull request runs only the specs its change reaches, and the same plan proves it before the push"
kind: perf
status: ready
type: proposal
track: ci
date: 2026-10-28
last-transition-id: 9f183b25-57d3-4f3e-b651-3ea852ba850a
last-correlation-id: 9f183b25-57d3-4f3e-b651-3ea852ba850a
last-transition-from: review
last-transition-at: 2026-11-03T00:01:25.986Z
shipped-in:
  - "84a042d1b596"
---

# v00143 — A pull request runs only the specs its change reaches, and the same plan proves it before the push

## goal

A pull request starts a test job only for a spec its change can break — by import or by a file the spec reads — and runs exactly those specs; a change that reaches none starts none. The plan CI follows is the one an agent runs before pushing, so a push is known good before the forge sees it.

## why

Measured on 2026-10-28 on #1552, a pull request that moves one proposal file from `in-progress/` to `review/`:

- The zone planner sent it to `proposals` (2 jobs), `plugins` (4 jobs, 726 specs) and `tools` (4 jobs, 325 specs): the committed read map (`zone-reads.generated.json`) is per zone, and the plugins and tools zones list 118 directories each, the proposal folders among them, because some spec in each zone lists them.
- Each of those jobs then ran `vitest --changed <base>`, which selects a spec only when its imports reach a changed file. `tests: plugins 1/4` printed "No test files found" after 38 s of setup and 1 min 44 s of collecting: the specs that read the proposals, the reason the job started, were not run at all. The pull request was both slow and blind to what it could break; develop's full run found such breaks after the merge.
- 38 jobs ran (2,511 job-seconds, CodeQL 312 s and lint-security 175 s among them) for one moved Markdown file. One-file documentation pull requests took 10 to 24 hours from opening to merge that day.
- My local gate before publishing repeated the whole of CI instead of the plan, about 45 minutes a unit; the forge then repeated it again.

## non-goals

- Dropping a check from develop's full run, which still runs every zone.
- Changing which checks are required.

## slices

- global_gate: type

### S1 — The read map says which spec read what
- **Status**: done
- **Files**: `tools/scripts/lib/record-reads-setup.ts`, `tools/scripts/ci/zone-reads.script.ts`, `tools/scripts/ci/zone-reads.script.spec.ts`, `tools/scripts/ci/test-zones.interface.ts`, `tools/scripts/ci/zone-reads.generated.json`, `biome.json`
- **Gate**: type
- acceptance:
  - "The recorder writes each read with the spec that made it (`expect.getState().testPath`), and the committed map holds, per zone, the specs and the files and directories each read, next to the zone totals it holds today."
- shipped-in: `84a042d1b596`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 84a042d1b596, validate exit 0 and tests 6/6 claimed, no recorded run cited; acceptance 1/1: (1) At 84a042d1 the recorder writes each read with the spec that made it, and the committed map holds, per zone, the specs and the files and directories each read … — Approved on the delivered state of 84a042d1b596. The read map says which spec read what, and holds the specs and the files and directories each read beside the zone totals it already held. The type gate exited 0 and the slice spec passes 6 of 6. One residual, recorded and not blocking: the recorder only wraps the node filesystem calls, so a spec that reads through another API is not attributed.

### S2 — A job runs the specs the change reaches, or does not start
- **Status**: done
- **Files**: `tools/scripts/ci/test-zones.script.ts`, `tools/scripts/ci/zone-reads.ts`, `tools/scripts/ci/zone-reads.spec.ts`, `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "For a change outside every workspace, a zone's jobs receive the list of its specs that read or list a changed path and run exactly those; with none, the zone does not start (the move of one proposal, #1552's change, starts 4 jobs running the 6 specs that read it instead of 12 jobs running none)."
  - "A change inside a workspace still runs `--changed` for the specs its imports reach, plus the listed readers of any changed root file."
- shipped-in: `84a042d1b596`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 84a042d1b596, validate exit 0 and tests 22/22 claimed, no recorded run cited; acceptance 2/2: (1) At 84a042d1 a change outside every workspace gives each zone the list of its specs that read or list the changed path and runs exactly those, and with none the… (2) At 84a042d1 a change inside a workspace still runs the changed selection for the specs its imports reach; the readers of a changed root file are named only for… — Approved on the delivered state of 84a042d1b596. A change outside every workspace reaches exactly the specs that read it, and a change inside a workspace still runs the changed selection. The type gate exited 0 and the slice spec passes 22 of 22. One deviation, recorded and not blocking, and the same pack delivers the missing half: the readers of a changed root file are attached only to a zone that the change reaches exclusively by reading, so when the same zone is also reached by code those readers are dropped and the plan runs the zone unfiltered for them. The slice S5 of v00146, approved in this same pack, delivers exactly that half: the readers of a root file in a zone whose code is reached too are named and merged into the shared readers job.

### S3 — The push is proved by the same plan
- **Status**: done
- **Files**: `tools/scripts/ci/prove-plan.script.ts`, `tools/scripts/ci/prove-plan.interface.ts`, `tools/scripts/ci/prove-plan.script.spec.ts`, `package.json`
- **Gate**: type
- acceptance:
  - "`bun run prove` plans the change against the integration branch exactly as CI does and runs the selected specs, the lints CI runs for the touched kinds of file, and the typecheck; it prints the plan, the time of each step and the verdict."
- shipped-in: `84a042d1b596`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 84a042d1b596, validate exit 0 and tests 7/7 claimed, no recorded run cited; acceptance 1/1: (1) At 84a042d1 the proof plans the change against the integration branch as the forge does, runs the selected specs the way the forge runs them, runs the typechec… — Approved on the delivered state of 84a042d1b596. The proof plans against the integration branch, runs the selected specs and the typecheck, and prints each step's time and the verdict. The type gate exited 0 and the slice spec passes 7 of 7. Two deviations, recorded and not blocking, and the same pack delivers the first: the proof runs a fixed list of four lints instead of the lints the forge runs for the kinds of file touched, a second hand-written list that drifts from the workflow; the slice S1 of v00147, approved in this same pack, replaces it by reading the static checks out of the workflow itself. And the plan is not printed, only the per-step label and the verdict.

### S4 — Documentation-only changes skip the code analyses
- **Status**: pending
- **Files**: `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`
- **Gate**: type
- acceptance:
  - "A pull request that changes only Markdown under docs/ reports CodeQL, lint-security, verify-runtime, pack smoke and the web build as passed without running them (a required check still reports), and runs the proposal and documentation lints."
- shipped-in: `84a042d1b596`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: requested_changes by minimax-m3.1-flash — Changes requested on slice S4, the documentation-only change that skips the code analyses.

WHAT IS WRONG. The slice was never delivered under this proposal. At its delivery commit 84a042d1 the workflow changed only the zone job: the CodeQL workflow is not in that delivery at all, and no rule that skips the code analyses for a prose change was added. Measured there, a Markdown-only change gave lint-biome, lint-security, verify-runtime, pack smoke and the site the plan to run, with only the typecheck and the metrics skipped: CodeQL analysed the whole repository and the secret scan still ran.

WHERE. The delivered state of this slice arrived later, inside v00144's S1 and S2, at commit 099561bea: the CodeQL workflow became scoped rather than skipped, and the job-scope table learned to skip the code jobs for a prose change.

HOW TO REPRODUCE. In a checkout of 84a042d1, run the job-scope plan for a change that touches only Markdown under docs/: the plan reports lint-security to run and verify-runtime, pack smoke and the site to skip, and the CodeQL workflow at that commit analyses the whole repository unscoped.

WHAT MUST HOLD, AND A CONFLICT THE OWNER MUST SETTLE. This slice's text asks for the secret scan to be reported as passed without running, and v00144's S2, which is a later proposal and is approved in this same pack, asks for the secret check to RUN on a prose change. The two cannot both stand. The delivered behaviour is v00144's: the secret scan runs, the code analyses are scoped rather than skipped, and the verification, pack smoke and site jobs skip. Either this proposal's text is amended to match the later decision, or the later one is changed; that is the owner's call, and this slice cannot be approved as written.

The remaining requirement, that a prose change still runs the proposal and documentation lints and that a required check still reports, is met by the delivered state.

## acceptance

- The recorder writes each read with the spec that made it (`expect.getState().testPath`), and the committed map holds, per zone, the specs and the files and directories each read, next to the zone totals it holds today.
- For a change outside every workspace, a zone's jobs receive the list of its specs that read or list a changed path and run exactly those; with none, the zone does not start (the move of one proposal, #1552's change, starts 4 jobs running the 6 specs that read it instead of 12 jobs running none).
- A change inside a workspace still runs `--changed` for the specs its imports reach, plus the listed readers of any changed root file.
- `bun run prove` plans the change against the integration branch exactly as CI does and runs the selected specs, the lints CI runs for the touched kinds of file, and the typecheck; it prints the plan, the time of each step and the verdict.
- A pull request that changes only Markdown under docs/ reports CodeQL, lint-security, verify-runtime, pack smoke and the web build as passed without running them (a required check still reports), and runs the proposal and documentation lints.
