---
id: x00573
title: "The workflow checks itself"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-20
tags:
    - work-refs
    - diagnostics
---

# x00573 — The workflow checks itself

## goal

Whether the work-ref model is actually holding is a question the
repository answers in one screen, naming the broken promise and its fix
— instead of a person noticing something wrong in a Git graph.

## why

Every promise this model makes has been verified, so far, by somebody
looking at a graph and spotting an anomaly. That is the slowest detector
available and the least reliable one. Measured over this session, the
same broken promise — a staged `AGENT-BOOTSTRAP.md` in the shared
checkout — was found **three separate times**, each time hours after it
appeared, each time by eye, and each time the diagnosis restarted from
nothing: which file, why staged, which hook, which branch.

That is not a monitoring gap; it is the same defect the rest of the cycle
keeps finding. The model has rails, and the question *are the rails
holding* had no implementation. So it fell to whoever happened to look,
which is exactly the class of work this model exists to remove.

The invariants were never written down in one place either. They were
distributed across proposals, hook comments and commit messages — so
checking them meant remembering them.

## non-goals

- Repairing anything. This is read-only, deliberately: a checker that
  also repairs cannot be run to find out whether repair was needed.
- Replacing the gates. `refuse-integration-commit` and the rest stop
  violations at the moment of the act; this reports the state that
  results, including states nothing refused.
- Blocking. It never fails a hook or a merge.

## architecture

Seven invariants, each with a claim, the evidence observed, and the
remedy:

| id | claim |
| --- | --- |
| `checkout-clean` | the shared checkout carries no modifications |
| `checkout-anchored` | it is on the integration branch |
| `no-abandoned-work-refs` | every local work ref has a worktree working on it |
| `publications-canonical` | every publication ref carries agent, slice and generation |
| `candidates-hydrated` | every candidate contains the integration branch |
| `no-leftover-worktrees` | every worktree stands on a work ref |
| `no-remote-work-refs` | no work ref outlived its publication |

Each carries a **scope**. `checkout` invariants are about this working
copy and are meaningless on a CI runner, whose checkout is always clean
and always detached — reporting them there would be a gate that is
permanently and falsely red. `forge` invariants answer the same from
anywhere, so CI judges those with `--forge`.

Two of the seven are stated as the *distinction* rather than the blunt
rule, because a check that is usually red is a check nobody reads: a work
ref with a worktree on it is an agent working, and only one without is
abandoned; a worktree on a work ref is work in progress, and only one on
something else is a leftover.

It resolves the pinned checkout through `--git-common-dir`, so it tells
the truth about the shared checkout even when an agent runs it from
inside its own worktree.

## slices

### S1 — the invariants are written down, checked, and reported

- **Status**: review
- **Files**: [`tools/scripts/git/check-workflow-invariants.script.ts`, `packages/cli/src/contracts/interfaces/workflow-invariants.interface.ts`, `packages/cli/src/lib/workflow-invariants.service.spec.ts`, `package.json`, `lefthook.yml`, `.github/workflows/keep-the-queue-moving.yml`]
- **Gate**: `npx vitest run packages/cli/src/lib/workflow-invariants.service.spec.ts`
- **Moved by x00598**: the interface and the spec shipped under
  `tools/scripts/git/check-workflow-invariants.*` and now live in
  `packages/cli`, because the invariants belong to the product rather
  than to this repository's toolbox. The script remains as a wrapper.

## acceptance

- `bun run work:doctor` reports all seven, with observed evidence on each
  whether it held or not.
- Each invariant is shown to fail against a repository deliberately put
  into the state it describes, and to hold otherwise.
- `--forge` reports exactly the three that a CI runner can judge.
- It runs after every merge (`post-merge`) and on every queue run,
  without blocking either.

## risks and mitigations

- **A check that is usually red gets ignored.** That is why the two
  work-ref invariants are stated as the distinction between live and
  abandoned rather than as "no work refs", and why every result carries
  what it observed — a check that only speaks when it fails cannot be
  trusted to have looked.
