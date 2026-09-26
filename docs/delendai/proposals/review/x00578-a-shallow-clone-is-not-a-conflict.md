---
id: x00578
title: "A shallow clone is not a conflict"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-20
tags:
    - ci
    - queue
shipped-in:
  - 87cc1e38f
---

# x00578 — A shallow clone is not a conflict

## goal

The queue's refresh actually refreshes, and when it cannot, it says
which of two very different reasons applies.

## why

The queue job has been reporting `forge:refresh: 0 refreshed` with every
candidate "conflicted", run after run. The logs say why:

```
fatal: refusing to merge unrelated histories
```

`keep-the-queue-moving` calls `setup-bun-repo` **without** `fetch-depth`,
so it takes the action's default of `'1'` — a clone one commit deep, with
no common ancestor in its object store. The action's own documentation
says it: *"Jobs that diff against a base ref need '0' for full history."*
This job does not merely diff against a base ref; it **merges** every
candidate against it.

So the merges were never going to work, and none of it was about the
content.

The second half is worse than the wasted runs. `git merge` fails for both
reasons with the same exit code, and the refresher reported every failure
as *"does not merge trivially. That is the author's call, not this
script's."* That sentence is correct for a conflict and actively
misleading here: it sends a person to resolve a disagreement that does
not exist, about files neither branch touched, when the remedy is one
line of workflow configuration.

It misled the author of this cycle's own diagnosis, who attributed the
stall to the merge driver. The driver was genuinely missing and fixing it
was genuinely necessary — but it was not why the queue reported zero.

## non-goals

- Making the refresher resolve conflicts. A real conflict is still the
  author's call.
- Deepening every job. Only the one that merges needs full history;
  everywhere else the shallow clone stays.

## architecture

`fetch-depth: '0'` on the queue job, with the reason recorded where the
next reader will look.

And the refresher asks the two questions apart. `shareHistory` runs
`git merge-base` for the pair, and `planRefresh` consults it **before**
`conflicted`, because without a common ancestor the merge never got far
enough to have an opinion about the content. The verdict then names the
remedy — deepen the clone — instead of asking for a judgement nobody has
to make.

`sharesHistory` is optional on the contract, so a caller that does not
probe behaves exactly as it did.

## slices

### S1 — the queue merges with the history it needs, and names what it lacks

- **Status**: done
- **Files**: [`.github/workflows/keep-the-queue-moving.yml`, `tools/scripts/forge/refresh-candidates.script.ts`, `tools/scripts/forge/refresh-candidates.interface.ts`, `tools/scripts/forge/refresh-candidates.script.spec.ts`]
- **Gate**: `npx vitest run tools/scripts/forge/refresh-candidates.script.spec.ts`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Independence OK: implementer claude-opus-5 (87cc1e38f), reviewer glm-5.3-max. Diff read: keep-the-queue-moving.yml sets fetch-depth: 0 on the checkout (the job MERGES candidates against the base, so the action default of 1 — no common ancestor — made every refresh die on 'refusing to merge unrelated histories'); refresh-candidates.script.ts distinguishes the two failure modes and names which one applies instead of reporting every candidate 'conflicted'. Gate refresh-candidates.script.spec.ts green in the 63/63 combined run. This closes the '0 refreshed run after run' defect at its root.
- review-attribution: claude-opus-5 from commit 87cc1e38f265 names refs/heads/delendai/wip/claude-opus-5/x00578-S1-g1/a-shallow-clone-is-not-a-conflict (87cc1e38f2659ea2da774b90f919f9370b2f0ba4), opened by glm-5.3-max
## acceptance

- A candidate with no common ancestor is reported as sharing no history,
  with `fetch-depth` named, and **without** calling it the author's call.
- That question is answered before the content is judged, even when
  something upstream already marked the candidate conflicted.
- A real conflict is still reported as the author's call.
- A candidate that shares history and merges cleanly is still refreshed.
- A caller that never probes behaves exactly as before.

## risks and mitigations

- **A full clone costs more to fetch.** Once per queue run, against a
  job that currently accomplishes nothing.
- **`merge-base` is asked per candidate.** One plumbing call each, on a
  job that already calls the forge API per candidate.
