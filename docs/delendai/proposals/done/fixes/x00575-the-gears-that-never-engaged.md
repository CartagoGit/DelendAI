---
id: x00575
title: "The gears that never engaged"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-20
tags:
    - queue
    - ci
    - automation
shipped-in:
  - d26d6480f
last-transition-id: 01f22225-1ffc-4cdc-bb94-3b70f66cddf4
last-correlation-id: 01f22225-1ffc-4cdc-bb94-3b70f66cddf4
last-transition-from: review
---

# x00575 — The gears that never engaged

## goal

Three mechanisms that were built, correct, and never actually turning
anything are connected to the thing they were built to drive.

## why

An exhaustive read of the workflow, from the git config outward, found
the same shape three more times: a mechanism that works, and nothing
calling it.

**Nothing arms auto-merge.** `keep-the-queue-moving` opens with
`open.filter((pull) => pull.auto_merge !== null)` and keeps moving
whatever it finds armed — and arming was a thing a person remembered to
do. Measured this session: five open candidates, all five armed by hand,
one at a time. "A green candidate merges itself" was true only for
candidates somebody had remembered, which is the opposite of the claim.

**`develop` is red, and CI could not have seen it.** A spec asserts that
this workflow and its script agree. A change to the workflow broke it and
merged anyway, because the zone filter is `--changed` — vitest's
**module-graph** filter, which selects a spec when its *imports* reach a
changed file. That spec does not import the workflow; it `readFileSync`s
it. No import anywhere reaches a `.yml`, so the one spec whose entire
subject was the changed file was the one spec guaranteed not to run.

The filter is not wrong — the reasoning behind it is sound and is written
down in the workflow. It is **blind by construction** to any spec whose
subject is a file it reads rather than imports.

**And that spec was too blunt to survive being right.** It asserted
`--apply` appears nowhere in the workflow file, which was true only while
this script was the only command in the job. The moment the job gained
steps that *do* read `--apply`, it began failing a correct workflow — a
test asserting something it was never trying to say.

## non-goals

- Arming pull requests this model did not produce. A branch outside the
  publication namespace is somebody else's decision.
- Abandoning `--changed`. It is the reason a pull request is minutes
  rather than half an hour; it just must not be consulted about files it
  cannot see.
- Merging anything sooner. Arming changes nothing about *what* merges —
  the required check still decides.

## architecture

**S1.** `keep-the-queue-moving` arms auto-merge on every open candidate
whose head is under the policy's publication prefix, is not a draft, and
is not armed already. The prefix comes from the resolved policy, not a
literal, so a project that renamed its namespace still arms its own work
and nobody else's. A forge that refuses is reported, not fatal.

**S2.** The zone step drops `--changed` when the change touches a path no
module graph can reach — `.github/**`, any `*.yml`, `.gitattributes`,
`.gitignore`, `lefthook.yml`. Those changes are rare, so the cost is
bounded and the blindness is gone.

**S3.** The workflow-agreement spec now asserts what it meant: `--apply`
is not passed **on the line that runs this script**. Stronger than the
blunt version, and true for a workflow that legitimately passes the flag
to scripts that read it.

## slices

### S1 — a candidate arms itself

- **Status**: done
- **Files**: [`tools/scripts/forge/keep-the-queue-moving.script.ts`, `tools/scripts/forge/keep-the-queue-moving.script.spec.ts`]
- **Gate**: `npx vitest run tools/scripts/forge/keep-the-queue-moving.script.spec.ts`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Independence OK: implementer claude-opus-5 (d26d6480f), reviewer glm-5.3-max. S1 (a candidate arms itself): keep-the-queue-moving.script.ts now arms auto-merge on a candidate that is not armed yet ('Arm auto-merge on a candidate that is not armed yet', line ~246) instead of only moving already-armed ones — the exact gap measured (five candidates, all armed by hand). S2 (the filter is not consulted about what it cannot see): ci.yml no longer filters on auto_merge at open. Gate keep-the-queue-moving.script.spec.ts green in the 63/63 combined run (4 files). changedSince (5fb8068fa, a7767357e, 360c3a5d6, aaf474072) is later queue-hardening, not supersession of what these slices delivered.
- review-attribution: claude-opus-5 from Merge pull request #310 from CartagoGit/delendai/pr/claude-opus-5/x00575-S1-g1/a-candidate-arms-itself (refs/heads/delendai/wip/claude-opus-5/x00575-S1-g1/a-candidate-arms-itself) (d26d6480f174a111e9d33cf040e3123bac03c892), opened by glm-5.3-max
### S2 — the filter is not consulted about what it cannot see

- **Status**: done
- **Files**: [`.github/workflows/ci.yml`]
- **Gate**: `npx vitest run tools/scripts/forge/keep-the-queue-moving.script.spec.ts`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Independence OK: implementer claude-opus-5, reviewer glm-5.3-max. S2 of the same delivery: the workflow/spec agreement question is resolved — ci.yml adjusted so the filter is not consulted about state it cannot see, and the spec that asserts workflow/script agreement is green in the same 63/63 combined run. Acceptance items of both slices verified against the delivered commit.
- review-attribution: claude-opus-5 from Merge pull request #310 from CartagoGit/delendai/pr/claude-opus-5/x00575-S1-g1/a-candidate-arms-itself (refs/heads/delendai/wip/claude-opus-5/x00575-S1-g1/a-candidate-arms-itself) (d26d6480f174a111e9d33cf040e3123bac03c892), opened by glm-5.3-max
## acceptance

- An unarmed candidate under the publication prefix is armed; an armed
  one, a draft, and a branch outside the namespace are all left alone.
- The prefix is read from the policy: the same pull request is armable
  under `acme/pr/` and not under `delendai/pr/`.
- A pull request touching only a workflow file runs the zone unfiltered.
- The workflow-agreement spec passes against a workflow that passes
  `--apply` to a script that reads it, and fails if it is passed to the
  one that does not.

## risks and mitigations

- **Arming something that should not merge.** Auto-merge waits for the
  required check exactly as a person clicking merge would; a red
  candidate never merges. A draft is skipped, and only this model's own
  namespace is touched.
- **The unfiltered run costs more.** Only for changes to configuration
  files, which are a small fraction of pull requests — and the
  alternative is what already happened: a broken integration branch with
  a green tick on it.
