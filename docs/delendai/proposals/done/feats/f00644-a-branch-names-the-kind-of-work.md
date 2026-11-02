---
id: f00644
title: "A branch names the kind of work"
kind: feat
status: done
type: proposal
track: trust
date: 2026-09-26
priority: P1
related: [x00563, f00642, x00660, x00671]
last-transition-id: a0e1c4e6-2d68-4bde-ae41-d2fc1a626543
last-correlation-id: a0e1c4e6-2d68-4bde-ae41-d2fc1a626543
last-transition-from: review
shipped-in:
  - "c91564a24"
  - "ba17cc410"
  - "f36a83089"
---

# f00644 — A branch names the kind of work

## goal

Every work ref and every publication ref says what kind of work it
carries: `<namespace>/wip/<agent>/<kind>/<id>-<slice>-g<n>/<topic>`, and
the same under `pr/`. The kinds form one closed vocabulary, stated once
next to the shape, so renaming the scheme is a one-line change. A review
batch is one branch, published as one pull request when the batch is
done.

## why

The maintainer asked for this on 2026-09-26. Branch names should show
at a glance what is happening, under a single source of truth that is
easy to change. Today the shape (`WORK_REF_SHAPE`, x00563) says who and
on what, but not what kind of work. An implementation, a review round, a
proposal being authored and a closing pass look alike. A reviewer's unit
is recognised only by the magic slice names `review` and `close`. A
proposal published by `create_proposal` was named outside the shape
altogether until x00671. Reviews also go one proposal per branch and one
pull request per proposal. The maintainer would rather see a batch of
reviews advance on one work branch and land as one pull request.

## why this design

- **The kind is a placeholder in the one shape.** It is `${kind}` in
  `WORK_REF_SHAPE`, with the vocabulary as a constant beside it:
  `implement`, `review`, `create`, `revise`, `audit`, `retire`, `repair`.
  Every writer builds names from the template and every reader parses
  with the template's own parser, so neither spells the shape again.
- **Slice and generation stay.** The generation keeps a regenerated unit
  from colliding with the old one, and the slice is still how work is
  published slice by slice. With f00642 it is mostly `all`.
- **Readers accept both shapes while old refs live.** Refs without a
  kind stay readable, as `implement`, or as `review` for the old `review`
  and `close` slices, until none are left. The migration renames
  nothing, because a branch rename closes its pull requests.
- **A review batch keeps claims without a new store.** A batch branch is
  `…/review/batch-g<n>/<topic>`. Each proposal it takes is declared by a
  commit on the branch with a `Claims: <id>` trailer, made before
  reviewing. `review_queue` reads claims from those commits, so the
  branch itself remains the only source. The batch is published as one
  pull request when the reviewer finishes it.

## non-goals

- Renaming refs that exist today.
- Letting a kind outside the vocabulary be written. An unknown kind is
  refused and the vocabulary is named, so a typo never becomes a new
  kind.

## architecture

- `packages/core/src/lib/development-policy/profiles.constant.ts`: the
  shape and the vocabulary.
- The readers that still use their own regex (for example
  `tools/scripts/lint/ref-lifecycle-guard.script.ts`) switch to the
  template's parser.
- `work enter --kind=` (default `implement`), review units as
  `review`, `create_proposal` as `create`.

## Slices

- global_gate: none

### S1 — The shape carries the kind, stated once, and every reader parses it

- **Status**: done
- **Files**: `packages/core/src/lib/development-policy/profiles.constant.ts`, `packages/core/src/lib/development-policy/work-ref-placeholders.ts`, `packages/core/src/lib/startup-reconciler/work-ref-identity.ts`, `packages/core/src/lib/startup-reconciler/work-ref-identity.interface.ts`, `packages/core/src/lib/wip-engine/ref-name.ts`, `packages/core/src/lib/wip-engine/ref-name.interface.ts`, `packages/core/src/lib/development-policy/git-guard.ts`, `packages/core/src/cli.ts`, `packages/core/src/public/index.ts`, `packages/core/src/lib/work-units/work-ref-shape.service.ts`, `packages/core/src/lib/contracts/interfaces/work-ref-shape.interface.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.ts`, `tools/scripts/lint/commit-branch-discipline.script.ts`, `packages/core/tests/src/lib/development-policy/git-guard.spec.ts`, `packages/core/tests/src/lib/startup-reconciler/classification.spec.ts`, `packages/core/tests/src/lib/startup-reconciler/work-ref-topic.spec.ts`, `packages/core/tests/src/lib/work-units/work-ref-shape.service.spec.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.spec.ts`, `tools/scripts/git/maintain-ref-namespace.script.ts`, `tools/scripts/git/maintain-ref-namespace.script.spec.ts`, `packages/core/src/lib/development-policy/git-guard-shape.ts`, `packages/core/src/lib/development-policy/git-guard-namespaces.ts`
- **Gate**: type
- acceptance:
  - "`WORK_REF_SHAPE` contains `${kind}`, and the vocabulary is one exported constant next to it."
  - "The template's parser reads a ref of the new shape and a ref of the old one (kind `implement`, or `review` for the old `review`/`close` slices)."
  - "No reader of work or publication refs spells the shape in its own regex."
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé c91564a24 (f00644 S1, merge 792db797f = PR #504). profiles.constant.ts tiene WORK_REF_SHAPE con placeholder ${kind} y la constant KIND_VOCABULARY (implement/review/create/revise/audit/retire/repair/reconcile) al lado. work-ref-identity + ref-name.ts cambian al parser del template; los readers que aún usaban su propio regex (ref-lifecycle-guard, commit-branch-discipline, git-guard) se migraron en 77694e37a (follow-up S1/S2). Bun run typecheck exit 0 (gate type). claude-opus-5-5 != minimax-m3 → veredicto independiente.

### S2 — Writers name the kind

- **Status**: done
- **DependsOn**: [S1]
- **Files**: `packages/cli/src/commands/work.command.ts`, `packages/core/src/lib/work-units/work-claim.service.ts`, `packages/core/src/lib/work-units/proposal-branch.service.ts`, `packages/core/src/lib/work-units/publication-target.service.ts`, `packages/core/src/lib/contracts/interfaces/publication-target.interface.ts`, `plugins/proposals/src/lib/tools/publish-proposal.ts`, `plugins/proposals/src/lib/contracts/interfaces/publish-proposal.interface.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/lib/services/review-claims.service.ts`, `plugins/proposals/src/lib/services/review-queue.service.ts`, `plugins/proposals/src/lib/contracts/constants/review-claims.constant.ts`, `packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`, `packages/cli/src/commands/work-claim.command.spec.ts`, `packages/cli/src/commands/guard.command.spec.ts`, `plugins/proposals/tests/src/lib/tools/publish-proposal.spec.ts`, `plugins/proposals/tests/src/lib/tools/create-proposal-publishes.spec.ts`, `plugins/proposals/tests/src/lib/tools/review-queue.tool.spec.ts`, `plugins/commit-policy/src/lib/persistence/wip-persistence.ts`, `plugins/commit-policy/src/lib/services/work-ref-policy.service.ts`, `plugins/commit-policy/src/lib/contracts/constants/work-ref.constant.ts`, `plugins/commit-policy/tests/src/lib/persistence/work-ref-naming.persistence.spec.ts`, `tools/scripts/lint/pr-head-shape.script.ts`, `tools/scripts/lint/pr-head-shape.script.spec.ts`, `package.json`, `.github/workflows/ci.yml`, `packages/core/src/lib/contracts/interfaces/git-guard.interface.ts`, `packages/cli/src/contracts/interfaces/guard.interface.ts`, `packages/cli/src/commands/guard.command.ts`
- **Gate**: type
- acceptance:
  - "`work enter --kind=<kind>` names the ref with it, defaults to `implement` (`review` for the old `review`/`close` slices), and refuses a kind outside the vocabulary by naming the vocabulary."
  - "The guard refuses, whatever host runs git and whether or not it declares an agent marker, a new work ref without a kind, an agent id that spells a kind, and a publication ref whose shape is not its work's, inside delendai's namespaces only."
  - "CI refuses a pull request whose head is not a well-shaped publication ref, whatever opened it."
  - "On delendai's branches a commit is authored as the repository's configured identity: `--author`, `-c user.*` and `GIT_AUTHOR_*` overrides are refused; the agent is named by the ref, in lower case."
  - "A review unit is `review`, a proposal published by `create_proposal` is `create`, and review claims recognise the kind instead of the magic slices."
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé ba17cc410 (último commit S2 antes del merge 792db797f = PR #504). S2 implementa `work enter --kind=<kind>` con default implement, refusal de kind fuera del vocabulario, guard que rechaza work ref sin kind / agent id que deletrea un kind / publication ref sin shape, CI (pr-head-shape lint) rechaza PRs con head mal formado, configured-author check (4f480e97c) que rechaza --author/-c user.*/GIT_AUTHOR_* en branches de delendai, y review claims leídos por kind (review-claims.service.ts) en lugar de magic slices. Bun run typecheck exit 0 (gate type). claude-opus-5-5 != minimax-m3 → veredicto independiente.

### S3 — A batch of reviews is one branch and one pull request

- **Status**: done
- **DependsOn**: [S2]
- **Files**: `plugins/proposals/src/lib/services/review-procedure.ts`, `plugins/proposals/src/lib/services/review-claims.service.ts`, `plugins/proposals/src/lib/contracts/constants/review-claims.constant.ts`, `plugins/proposals/tests/src/lib/tools/review-queue.tool.spec.ts`, `packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`
- **Gate**: type
- acceptance:
  - "A reviewer enters one `review` batch unit and claims each proposal with a `Claims: <id>` commit before reviewing it."
  - "`review_queue` reports a proposal claimed in another agent's batch as held by that agent, until the batch merges."
  - "The procedure tells the reviewer to commit after each verdict and to publish the batch once, when it is done."
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé f36a83089 (último commit S3 antes del merge 792db797f = PR #504). S3 implementa: review unit como kind=review batch, Claims: <id> trailer en commit conventional como claim, review_queue lee los claims de los trailers del batch branch (no de un store aparte), review-procedure.ts lleva el texto del procedimiento (commit per verdict + publish once when done). Esta misma sesión usó este flujo en pack 1 (5 propuestas reclamadas con trailers Claims, publicadas como PR #615). Bun run typecheck exit 0 (gate type). claude-opus-5-5 != minimax-m3 → veredicto independiente.

## dependency graph

S1 → S2 → S3.

## acceptance

- Every new work and publication ref names its kind, from one vocabulary
  stated once.
- Refs of the old shape are still read correctly.
- A review batch advances on one branch and lands as one pull request,
  with its claims read from its own commits.
