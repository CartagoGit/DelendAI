---
id: x00628
title: "One writer brings a candidate forward"
kind: fix
status: review
type: proposal
track: workflow
date: 2026-09-24
shipped-in: ["de9656046", "9dc578b82", "bcb388cd1", "e796efabd", "31ed234b3"]
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

- **Status**: done (#381)
- **Gate**: `npx vitest run tools/scripts/git`
- **Files**: `tools/scripts/git/hydrate-candidates-after-merge.script.ts`,
  `tools/scripts/git/hydrate-candidates-after-merge.script.spec.ts`,
  `tools/scripts/git/refresh-candidate-artifacts.constant.ts`,
  `tools/scripts/git/refresh-candidate-artifacts.script.ts`,
  `tools/scripts/git/refresh-candidate-artifacts.script.spec.ts`
- Found on 2026-09-24, after S2 shipped. The hydrator the owner machine
  runs after every merge into the integration branch ran two writers:
  `forge:refresh --apply`, a textual merge of every candidate, and then
  `refresh-candidate-artifacts`, which merges and regenerates only the
  candidates still behind. After the first none was, so the second never
  ran: 179 hydration merges since 2026-09-20 and not one regeneration
  commit. It also regenerated with its own two-command list instead of
  `gen:all`.
- One writer now: merge, `bun install --frozen-lockfile`, `gen:all`,
  push, in a throwaway worktree. The post-merge hook starts it in the
  background, because it takes minutes and the hook holds `git pull`.

### S4 — A linked worktree never rewrites the configuration its clone shares

- **Status**: done (#382)
- **Gate**: `npx vitest run tools/scripts/git/prepare-clone.script.spec.ts`
- **Files**: `package.json`,
  `tools/scripts/git/prepare-clone.script.ts`,
  `tools/scripts/git/prepare-clone.script.spec.ts`
- Found on 2026-09-24, caused by S3. `prepare` writes `.git/config` and
  `.git/hooks`, which every worktree of a clone shares. S3 installed
  dependencies in a throwaway worktree, so `prepare` wrote that
  worktree's path into the guard entry and the merge driver; once it
  was deleted, the reference-transaction guard could not start and every
  branch creation in the clone, a person's included, was refused. It
  recurred on three later hydrations and was restored by hand each time.
  `prepare` is now one script that does nothing in a linked worktree
  and runs the same steps as before in the main checkout.

### S5 — A post-merge refresh never commits somebody's uncommitted edit

- **Status**: done (#385)
- **Gate**: `npx vitest run packages/cli/src/lib/generated-refresh.service.spec.ts`
- **Files**: `packages/cli/src/contracts/constants/generated-refresh.constant.ts`,
  `packages/cli/src/lib/generated-refresh.service.ts`,
  `packages/cli/src/lib/generated-refresh.service.spec.ts`
- Found on 2026-09-24: the post-merge refresh took "changed" to mean
  "differs from HEAD", so a hand edit, uncommitted when a merge ran, was
  committed as `chore(generated): recompute after a merge`. A bounded
  path that already differed from HEAD now stays exactly as its owner
  left it. The bootstrap leaves the bounded paths: nothing in it is
  generated any more.

## acceptance

- After this lands, every `Merge <integration> into <candidate>` commit
  has one author, the owner's.
