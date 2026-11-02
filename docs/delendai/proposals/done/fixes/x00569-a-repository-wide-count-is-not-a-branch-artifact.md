---
id: x00569
title: "A repository-wide count is not a branch artifact"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-20
tags:
    - generated-artifacts
    - drift
    - queue
shipped-in:
  - b29dbfb5d
last-transition-id: 31df6e5e-d5c0-4314-a071-9088aa844873
last-correlation-id: 31df6e5e-d5c0-4314-a071-9088aa844873
last-transition-from: review
---

# x00569 — A repository-wide count is not a branch artifact

## goal

Two candidates that touch different files can both be green at the same
time, and stay green when one of them merges.

## why

Six open candidates failed `drift` and `lint-presets` together, were
refreshed, went green, and failed again the moment one of them merged.
That happened four times in one session. The diff was identical every
time, and it was one field:

```diff
 		"byStatus": {
 			"ready": 40,
-			"review": 36,
+			"review": 38,
```

`byStatus` is a count over **every proposal in the repository**. The
artifact carrying it is checked in, and CI compares it against its
generator on the pull request's **merge ref** — branch plus integration
branch. With N candidates open, each merge ref sees a different total, so
the committed number can be correct for at most one candidate at a time,
and every merge invalidates all the others.

No amount of refreshing fixes that. Refreshing only moves the failure to
whichever candidate merges last, which is exactly what was observed: the
queue stopping for a number that nobody changed and no branch owns.

The per-proposal entries in the same artifact are branch-local facts and
merge correctly. It is only the roll-up that cannot belong to a branch.

Nothing reads it. `proposals_compact_status` already counts statuses at
read time from the proposals on disk; the quantitative snapshot builds
its own; the only reference to the artifact's copy was the generator's
own spec.

## non-goals

- Removing per-proposal data from the catalog. That merges fine.
- Relaxing `drift`, or making it tolerate stale artifacts. The gate is
  correct; it was being asked to judge a value that has no per-branch
  answer.
- Changing how any consumer counts proposals. They already count live.

## architecture

`byStatus` leaves `IGeneratedAgentCatalogArtifact` and the object the
generator builds, with the reason recorded at the declaration so the next
person does not re-add it. A spec asserts the field is absent, so
re-adding it fails rather than quietly restarting the queue stalls.

## slices

### S1 — the catalog carries no repository-wide roll-up

- **Status**: done
- **Files**: [`tools/scripts/catalog/generate-agent-catalog.script.ts`, `tools/scripts/catalog/generate-agent-catalog.spec.ts`, `docs/delendai/agent-catalog.generated.json`]
- **Gate**: `npx vitest run tools/scripts/catalog/generate-agent-catalog.spec.ts`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Independence OK: implementer claude-opus-5 (b29dbfb5d, PR #304), reviewer glm-5.3-max. Verified: docs/delendai/agent-catalog.generated.json contains NO byStatus key (programmatic scan of the whole artifact, not just top level); generate-agent-catalog.spec.ts green 18/18 including the assertion that fails if the roll-up is re-added; the generator no longer builds the field. Acceptance catalog:check/check:quantitative: catalog:check is part of the validate chain that ran; the count consumers (proposals_compact_status) count live as the proposal states. This slice is the fix that stopped N candidates fighting over one repository-wide number in the merge ref — root cause of the four-times-in-one-session stall.
- review-attribution: claude-opus-5 from Merge pull request #304 from CartagoGit/delendai/pr/claude-opus-5/x00569-S1-g1/a-repo-wide-count-is-not-a-branch-artifact (refs/heads/delendai/wip/claude-opus-5/x00569-S1-g1/a-repo-wide-count-is-not-a-branch-artifact) (b29dbfb5d2bd75c56327c3ec29dc39314f70eebd), opened by glm-5.3-max
## acceptance

- The generated artifact has no `byStatus` key.
- `catalog:check` and `check:quantitative` pass.
- `typecheck` passes: no consumer referenced the field.
- A spec fails if the roll-up is re-added.

## risks and mitigations

- **An adopter read `proposals.byStatus` from the artifact.** The
  per-proposal entries are still there in `full` mode, and
  `proposals_compact_status` answers the same question live. The count
  was a snapshot of a moving number; reading it was never sound.
