---
id: x00628
title: "One writer brings a candidate forward"
kind: fix
status: ready
type: proposal
track: workflow
date: 2026-09-24
---

# x00628 — One writer brings a candidate forward

## goal

Each kind of automatic git transition has one writer, so the author of a
commit says what kind of act produced it. "Bring a candidate forward"
(`Merge develop into delendai/pr/…`) is currently produced by two.

## why

Observed on 2026-09-23 in the graph of pull request #362. The same
transition, `Merge develop into …x00608…`, appears twice, once authored
`CartagoGit` (`263c561f`) and once `delendai-queue` (`ba6af341`).
x00557 S2 decided that bringing candidates forward happens on the
owner's machine, with the owner's credential, and that CI only reports,
because a bot's commit does not start workflows. Its slice text says so.
The `keep-the-queue-moving` workflow still runs
`forge:refresh -- --apply` and `forge:artifacts -- --apply` as
`delendai-queue`. So there are two writers for one transition, racing on
the same branches. The CI writer also merges generated files textually:
on 2026-09-24 both #362 and #366 went red on `drift` because the queue's
merge carried a catalog listing a proposal as `ready` that the
integration branch had already moved to `review`.

Pull-request merges show the same shape: some are authored by the person
who armed auto-merge by hand, and some by `github-actions[bot]`, because
the queue arms candidates itself. The queue is the writer; arming by hand
is the duplicate. That part is an operating rule, recorded in the agent
bootstrap rather than in code.

## why this design

- **x00557 S2 is the decision.** This proposal makes the workflow match
  it: CI reports stale candidates and does not bring them forward.
- **The owner machine regenerates, rather than merging generated files as
  text.** Its hydration path already runs the generators after the
  merge.

## non-goals

- Changing who merges pull requests (the queue, through auto-merge).

## Slices

- global_gate: none

### S1 — CI reports stale candidates and does not rewrite them

- **Status**: done — the step now runs `forge:refresh` read-only. The
  integration branch does not require candidates to be up to date
  (`strict: false`), and candidates are validated on the forge's merge
  ref, so merging never depended on this writer.
- **Gate**: `bun run lint:workflow-yaml`
- **Files**: `.github/workflows/keep-the-queue-moving.yml`
- The "bring the candidates forward" step reports what is behind, and
  names the machine and command that brings it forward.

### S2 — Agents do not arm candidates by hand

- **Status**: done (#376)
- **Gate**: `bun run lint:prompt-size`
- **Files**: `docs/delendai/AGENT-BOOTSTRAP.md`
- One rule: open the pull request, and leave arming to the queue. An
  agent working on the owner's machine is the owner machine for
  hydration; it brings a candidate forward by merging and regenerating,
  never by a textual merge of generated files.

### S3 — The owner machine regenerates what it merges

- **Status**: pending
- **Gate**: `npx vitest run tools/scripts/forge`
- **Files**: `tools/scripts/forge/refresh-candidates.script.ts` — the
  literal list is recorded when the slice ships
- Found on 2026-09-24, after S2 shipped. The hydrator the owner machine
  runs after every merge into the integration branch
  (`hydrate-candidates-after-merge` → `forge:refresh --apply`) merges in
  a throwaway detached worktree with a real `git merge`, and pushes the
  result without running a single generator. That is the textual merge
  of generated files S2 tells agents never to make. A candidate brought
  forward this way is right only when neither side touched a generator's
  inputs.
- After the merge, the throwaway worktree runs `gen:all` and commits any
  regenerated file into the same merge commit before pushing. If a
  generator fails, the candidate is reported, not pushed.

## acceptance

- After this lands, every `Merge <integration> into <candidate>` commit
  has one author, the owner's.
