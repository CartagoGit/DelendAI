---
id: x00587
title: "Every project gets a ref of its own"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-21
tags:
    - development-policy
    - defaults
shipped-in:
  - "1655ff141175369282782369d4b0627ddc25cee9"
last-transition-id: 4587b72a-7d60-4e65-bb10-58f737b167e5
last-correlation-id: 4587b72a-7d60-4e65-bb10-58f737b167e5
last-transition-from: review
---

# x00587 — Every project gets a ref of its own

## goal

An agent works in a ref of its own under every configuration and on
every forge — not only where pull requests exist.

## why

The whole work-ref model — the guards, the publication shape, the
namespace maintenance, the invariants checker — applied to **two of four
profiles**, and the default was not one of them:

```
shared-direct          workRefTemplate=""    ← the DEFAULT
shared-checkout-pr     workRefTemplate="heads/wip/…"
shared-checkout-merge  workRefTemplate="heads/wip/…"
worktree-pr            workRefTemplate="agent/${agent}/${proposal}-${slice}"
```

So a project that adopted delendai without naming a profile gave its
agents **nowhere to work but the shared checkout**, while every guard
built for the model refused them with *"this profile has no work-ref
model"*. In practice the model applied only to projects whose forge has
pull requests **and** whose integration branch is protected by them.

That is not a hardening gap. It is the reason agents keep editing the
shared tree: under the default there is nothing else to edit, and the
rules they are told to follow do not apply to them.

`worktree-pr` compounded it with a **fourth** spelling of the ref —
no namespace, no generation, no topic — so the canon stated once in
`WORK_REF_SHAPE` was true for three profiles out of four.

## why this design

The first attempt was to give `shared-direct` a work ref. The validator
refused it, correctly:

> *Work is persisted to wip refs, but integration is direct — there is
> nowhere for a checkpoint to be certified before it lands.*

`direct` means pushing onto the branch gated only by local policy. A wip
that lands with nothing certifying it is not the model; it is the old
model with extra steps.

The vocabulary already had the right answer. `merge` is defined as:
*"Work still leaves an isolated ref and still has to be certified before
it lands; what changes is WHO certifies it… the local gate is the only
thing between the work and the branch, so it becomes mandatory."* No
review object, no branch protection, nothing a plain git remote cannot
do.

So the defect was never that `direct` lacked a work ref. It was that
`direct` was the **default** — choosing the weakest model as the default
made the strongest guarantees opt-in, which is backwards.

## non-goals

- Removing `shared-direct`. A project that wants nothing between an edit
  and the branch can still say so.
- Migrating legacy projects. A configuration written before profiles
  existed keeps the historical model until its project chooses.

## architecture

`DEFAULT_DEVELOPMENT_PROFILE` becomes `shared-checkout-merge`.

`worktree-pr` adopts `WORK_REF_SHAPE`: where an agent edits (a worktree
of its own) is a different question from what its ref is called.

`fromLegacy` expands `shared-direct` **by name** rather than reading the
default. Reading the default meant that changing it silently migrated
every legacy project to a model they never chose — which is precisely
what this compatibility path exists to prevent, and exactly what happened
the moment the default moved.

## slices

### S1 — the default grants a work ref, and every profile spells it the same

- **Status**: done
- **Files**: [`packages/core/src/lib/development-policy/profiles.constant.ts`, `packages/core/src/lib/development-policy/profiles.ts`, `packages/core/src/lib/development-policy/resolve.ts`, `packages/core/tests/src/lib/development-policy/resolve.spec.ts`]
- **Gate**: `npx vitest run packages/core/tests/src/lib/development-policy/`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real 1655ff141 (merge de x00587). El perfil por defecto de un proyecto sin configurar pasa de shared-direct a shared-checkout-merge: todo proyecto adoptado recibe work-ref propio y certificación local, sin exigir PR/branch-protection del forge; los cuatro perfiles producen el mismo workRefTemplate; shared-direct sigue resolviendo al modelo histórico cuando se pide por nombre; la config legacy no cambia; la política por defecto pasa validateDevelopmentPolicy sin problemas. Acceptance cubierta (resolve.spec 28 líneas nuevas; gate 34/34 en lote). Sin cambios fuera de alcance.
- review-attribution: claude-opus-5 from commit 1655ff141175 names refs/heads/delendai/wip/claude-opus-5/x00587-S1-g1/every-profile-gives-an-agent-a-ref-of-its-own (1655ff141175369282782369d4b0627ddc25cee9), opened by glm-5.3-max
## acceptance

- An unconfigured project resolves to `merge`, with a work ref, local
  certification, and no direct integration commits.
- All four profiles produce the same `workRefTemplate`.
- `shared-direct` still resolves to the historical model when asked for
  by name.
- A legacy configuration is unchanged.
- The default policy passes `validateDevelopmentPolicy` with no
  problems.

## risks and mitigations

- **An adopter's default behaviour changes.** It changes toward the model
  the documentation already describes, on a profile that asks nothing of
  their forge. A project that wants the old behaviour names
  `shared-direct`, and a legacy configuration keeps it without doing
  anything.
