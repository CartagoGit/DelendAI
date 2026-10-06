---
id: f00755
title: "Candidates that touch nothing in common land together"
kind: feat
status: done
type: proposal
track: efficiency
date: 2026-09-29
priority: P1
related: [x00556]
last-transition-id: a5f88e51-f192-42a4-949f-6f76cf22d318
last-correlation-id: a5f88e51-f192-42a4-949f-6f76cf22d318
last-transition-from: review
shipped-in:
  - "5322de8e5447d45a7c18924135efa03201dd88de"
---

# f00755 — Candidates that touch nothing in common land together

## goal

Green candidates whose changes cannot affect each other land one after the
other without being brought forward and tested again; only a candidate
that the integration branch changed something under is.

## why

On 2026-09-29 four green pull requests took more than an hour to land.
The queue armed one candidate at a time, the head of the queue, and only
once it was level with the integration branch and the branch was
certified. After each merge every other candidate was behind; the owner
machine brought the head forward with a merge commit, its checks ran
again (about twenty minutes), then the next merge repeated it for the
rest. None of the four could affect another. The branch protection does
not require it (`develop` has `strict: false`); the queue did.

## why this design

- **Independence is measured, with the planner CI already trusts.** For a
  candidate that left the integration branch at `B`: its footprint is the
  test zones and files `B...candidate` changes, the integration branch's is
  what `B...tip` changes. The zones come from `reachableZones`, the same
  selection a pull request's checks run (x00556 S5), so "its checks stayed
  valid" means exactly "nothing that could change their result changed".
- **Accepted in queue order.** A candidate lands as it is when it is level,
  or when its footprint and the integration branch's share no zone and no
  file; and in both cases when it shares none with a candidate accepted
  before it, because they land on top of each other. A change that can
  reach every zone (root configuration, a workflow) is independent of
  nothing.
- **One decision, two users.** The queue job arms every accepted candidate
  and disarms the rest; the owner machine brings forward only the ones not
  accepted. Both read `queueAcceptance`.
- **A red integration branch still lands only its repair.** A pending one
  no longer blocks: every candidate that lands does so on checks that stay
  valid, and the integration branch still runs every check after each
  merge.

## non-goals

- Changing the branch protection (`strict` is already off on `develop`).

## Slices

- global_gate: none

### S1 — The queue lands every independent candidate

- **Status**: done
- **Gate**: `npx vitest run tools/scripts/forge/independent-candidates.spec.ts tools/scripts/forge/queue-acceptance.spec.ts`
- **Files**:
  - `tools/scripts/forge/independent-candidates.ts`
  - `tools/scripts/forge/independent-candidates.interface.ts`
  - `tools/scripts/forge/independent-candidates.spec.ts`
  - `tools/scripts/forge/candidate-footprint.ts`
  - `tools/scripts/forge/queue-acceptance.ts`
  - `tools/scripts/forge/queue-acceptance.spec.ts`
  - `tools/scripts/forge/queue-acceptance.ts`
  - `tools/scripts/forge/keep-the-queue-moving.script.ts`
  - `tools/scripts/git/refresh-candidate-artifacts.script.ts`
  - `tools/scripts/ci/test-zones.script.ts`
- shipped-in: `230e2af9c73b`
- review-attribution: unrecorded — no delivering commit was named for f00755 S1; independence could not be verified, opened by gpt-5.4
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: requested_changes by gpt-5.4 — El gate declarado pasa 6/6, pero branchesLandingAsTheyAre calcula integrationSha con rev-parse origin/<integration> antes de hacer fetch y luego decide con ese SHA obsoleto, mientras keep-the-queue-moving decide con certification.sha actual. Si la ref remota local está atrasada, el owner machine puede tratar una candidata como level y no traerla adelante aunque la integración ya cambió zonas/archivos superpuestos. Reproducible en tools/scripts/forge/queue-acceptance.ts: branchesLandingAsTheyAre fija integrationSha antes del fetch y queueAcceptance sólo hace fetch después.
- review-log: approved by minimax-3 — verified at 5322de8e5447, validate exit 0, tests 8/8 — Delivered by PR #764 (merge 5322de8e5447) on top of 230e2af9c73b. The defect gpt-5.4 recorded on 2026-10-04 is repaired: branchesLandingAsTheyAre now fetches the integration ref BEFORE revParse resolves its SHA, and queue-acceptance.spec.ts carries two regression tests for it (a candidate level with the integration branch lands as it is; it does not once the integration branch moved in the same file although this machine had not fetched). Declared gate green 8/8 (independent-candidates.spec.ts + queue-acceptance.spec.ts): four disjoint candidates accepted level-or-not, a candidate the integration branch changed under it brought forward, an overlapping candidate held even when level, and a change reaching every zone never landed beside another. The third acceptance line cites the 2026-09-29 scenario (#649 level lands, #650 brought forward) which is no longer reproducible as a literal fixture; the mechanism it names is what the level-vs-behind test asserts.

## dependency graph

x00556 S5 (file-precise zones) → S1.

## acceptance

- Four candidates touching different zones and files are all accepted, a
  level one and three behind.
- A candidate the integration branch changed a zone of since it left is
  brought forward; so is one that overlaps an earlier accepted candidate,
  even when level; a change that can reach every zone lands alone.
- Against the open pull requests on 2026-09-29: #649 (level) lands, and
  #650 is brought forward because both move a proposal into review, which
  the `tools` and `proposals` zones list.
