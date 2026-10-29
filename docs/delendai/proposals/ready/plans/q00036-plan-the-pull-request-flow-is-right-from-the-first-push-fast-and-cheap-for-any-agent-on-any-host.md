---
id: q00036
title: "Plan: the pull-request flow is right from the first push, fast and cheap, for any agent on any host"
kind: plan
status: ready
type: proposal
track: ci
date: 2026-10-29
---

# q00036 — Plan: the pull-request flow is right from the first push, fast and cheap, for any agent on any host

## goal

A change goes from its first push to develop correctly, quickly and cheaply, whoever makes it. Any model on any host gets the same flow from the product's own commands. A pull request is checked only for what its change reaches, never on the author's word. It is armed the moment it is green and lands without being sent back for reasons that are not its own. Every unit ends with nothing left behind. The owner should not have to correct a rule that was already stated.

## why

### What the owner asked, and what happened instead

The owner's standing instructions (2026-10-27/29) are:

- PR efficiency comes first: fast, cheap and reliable.
- Each pull request checks only what it needs: the tests, lints, types and security of what changed.
- Everything is verified locally before it is pushed.
- Work goes through one wip per proposal and pull requests of large slices or batches.
- A fix to a just-landed change reopens its proposal.
- Worktrees and refs are clean when a unit ends.
- The flow holds for any host or LLM.

Several of these were already rules and still were not met, because a rule that is only text binds only the agents that read and follow it:

- **Prove before publishing.** The profile tells every agent "Prove the candidate in isolation BEFORE you publish it", but on the pull-request route nothing runs a proof. The owner's BYOK agents published red and empty units (x00990).
- **The fast flow was private.** It lived in one orchestrator's `~/.cache/claude-orch` scripts (`gates-fast.sh`, `batch.sh`, `near-specs.ts`), which no other agent has.
- **Trigger and condition assumptions were wrong, and nothing on its own run checked them.**
  - A promotion workflow triggered on push could never find develop ready, because the checks of a new head have not run at push time and a queue merge starts no push run (f00795).
  - A required `CodeQL` check is posted on pull requests only (f00795).
  - A job after the aggregate was silently skipped without `!cancelled()` (v00146, #1578).
- **The queue woke only hourly or after a certification**, so a green pull request waited up to an hour to be armed (v00146).

### Baseline, measured 2026-10-29

| Measure | Value |
|---|---|
| Small pull request (#1575) | 19 jobs, 13 runner-minutes |
| Full run (#1577) | 36 jobs, 51 runner-minutes, 14 of them setup at 18-34 s per job; wall 352 s |
| Test shards on a full run | 75-244 s (`proposals 2/2` 244 s, most others 90-130 s) |
| Runner queue wait | median 2 s, p90 5 s over 543 jobs in the busiest window: runners are not the bottleneck |
| Created → merged, after v00146 | 10-13 min (#1579, #1580) |
| Rebuilds after opening (last 40 merged) | 31 took at least one merge of develop, 13 took three or more, each a full CI run again |
| Configuration files | 8 of the 40 touched one (`package.json`, `bun.lock`, tsconfig, vitest config, `delendai.config.json`), which runs every zone |
| Local fast proof per hand-over | about 90 s (typecheck 19 s, lint:architecture 25 s, lint:proposals 10 s, biome-baseline 6 s, nearest specs 31 s) |
| `vitest --changed` on a core change | 656 s |

### Already delivered on the way (2026-10-29)

- v00146:
  - Only the test jobs that run are started, and readers are merged into one job.
  - The tests no longer wait for typecheck and biome: shards start at +36 s instead of +68 s.
  - Coverage instruments only the touched files: 54 s → 23 s on a zone.
  - A green publication wakes the queue.
  - Prose reaches only its readers, and a workflow edit no longer runs its zones unfiltered.
- f00795: the promotion opens on the roadmap milestone, is asked for when develop's code scanning lands, and is held back until develop carries its release.

## why this design

1. **A rule the product states, the product enforces.** Text that an agent may ignore is a defect, not a rule.
2. **One source of truth.** The local proof and the forge's plan come from the same planner; a check is listed once.
3. **Never on the author's word.** A local proof saves the author a failed run. It never lets the forge skip a check.
4. **Measure before and after.** Each part names its number, and the hand-over shows it on the pull request's own run, not on a spec alone.
5. **Prove the trigger, not just the logic.** A workflow, job or trigger change is accepted only when its own run shows it firing (lesson of #1578).
6. **Every layout change ships its migration**, and every unit ends clean.

## dependency graph

The parts, in order; each one depends only on those before it where it says so.

1. **f00796 — Any agent proves and hands over with the product's commands.**
   - The nearest specs move into the product, and this repository declares its proof.
   - `work publish` runs the declared proof on the pull-request route and refuses a red one.
   - A proved tree is not proved twice.
   - Preparing a unit installs and regenerates only when needed.
   - First because it removes the private scripts and the most expensive failure: a red push.
2. **v00147 — The static checks run in one job.** About twelve setups become one: roughly 5 runner-minutes and most setup wall time saved per pull request.
3. **v00148 — Test shards are balanced by measured time.** The full run's slowest shard drops from 244 s toward the mean, about 140 s.
4. **v00149 — A derived file is not an overlap.** Measure which shared files send candidates back, stop bringing a candidate forward for a derived file alone, and split or stop committing the worst offenders.
5. **v00150 — A configuration change runs only what it configures.** `package.json` by changed fields, the lockfile by moved packages, and the read recorder sees spawned processes.
6. **v00144 S6 — Every unit ends clean** (`work gc`). Also v00144's own record: S1-S5 shipped in #1565, #1566, #1573 and #1574 while the proposal still says `pending` in `ready/`. Its statuses are brought in line with what shipped.

## notes

Targets, against the baseline above:

| Measure | Target |
|---|---|
| Small pull request | at most 8 jobs and 7 runner-minutes |
| Full run | wall 250 s or less, runner time 35 minutes or less |
| Created → merged for a green small change | 10 minutes or less, unchanged under a burst of pull requests, since the queue arms every green candidate in one pass |
| Rebuilds | no candidate brought forward for a derived file alone |
| Red publications | a pull request whose author ran the product's hand-over is never red on a check the proof covers |

## non-goals

- A merge queue of the forge's own: GitHub offers it only to organization repositories, and this one belongs to a user. Batching comes from the queue arming every green candidate at once.
- Uploading locally produced code scanning results (SARIF) in place of the forge's analysis: that is a check on the author's word (principle 3). The pull request's scoped CodeQL already takes about a minute.

## slices

- global_gate: type

### S1 — The product's hand-over (f00796)
- **Status**: pending
- **Files**: `docs/delendai/proposals/ready/feats/f00796-any-agent-proves-and-hands-over-its-work-with-the-product-s-own-commands-and-a-hand-over-that-is-not-proved-is-refused.md`
- **Gate**: type
- acceptance:
  - "f00796 is done and a hand-over by an agent with none of the orchestrator's scripts proves, publishes, and is refused when red."

### S2 — One job for the static checks (v00147)
- **Status**: pending
- **Files**: `docs/delendai/proposals/ready/perfs/v00147-a-pull-request-s-static-checks-run-in-one-job-each-still-named-in-its-verdict.md`
- **Gate**: type
- acceptance:
  - "v00147 is done and a small pull request's run shows at most 8 jobs."

### S3 — Shards balanced by time (v00148)
- **Status**: pending
- **Files**: `docs/delendai/proposals/ready/perfs/v00148-test-shards-are-balanced-by-the-time-their-specs-take-not-by-how-many-there-are.md`
- **Gate**: type
- acceptance:
  - "v00148 is done and a full run's slowest test shard is within 20% of the mean shard."

### S4 — Derived files do not send candidates back (v00149)
- **Status**: pending
- **Files**: `docs/delendai/proposals/ready/perfs/v00149-two-pull-requests-never-regenerate-the-same-file-so-one-landing-does-not-send-the-others-back.md`
- **Gate**: type
- acceptance:
  - "v00149 is done and its overlap report over the following week names no derived file."

### S5 — Configuration runs what it configures (v00150)
- **Status**: pending
- **Files**: `docs/delendai/proposals/ready/perfs/v00150-a-configuration-change-runs-only-what-it-configures.md`
- **Gate**: type
- acceptance:
  - "v00150 is done and a scripts-only `package.json` change runs only the specs that read it."

### S6 — Every unit ends clean (v00144 S6)
- **Status**: pending
- **Files**: `docs/delendai/proposals/ready/perfs/v00144-work-is-proved-locally-by-the-plan-the-forge-follows-the-forge-judges-only-what-a-change-reaches-and-every-unit-ends-with-nothing-left-behind.md`
- **Gate**: type
- acceptance:
  - "v00144 records S1-S5 as shipped and S6 is done: after a unit ends, `work gc` leaves no local branch, worktree or ref of it."

## acceptance

- f00796 is done and a hand-over by an agent with none of the orchestrator's scripts proves, publishes, and is refused when red.
- v00147 is done and a small pull request's run shows at most 8 jobs.
- v00148 is done and a full run's slowest test shard is within 20% of the mean shard.
- v00149 is done and its overlap report over the following week names no derived file.
- v00150 is done and a scripts-only `package.json` change runs only the specs that read it.
- v00144 records S1-S5 as shipped and S6 is done: after a unit ends, `work gc` leaves no local branch, worktree or ref of it.
