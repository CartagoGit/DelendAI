---
id: x00721
title: "A command refuses a flag it does not read"
kind: fix
status: review
type: proposal
track: hosts
date: 2026-09-28
priority: P1
related: [x00705, x00717, x00720]
last-transition-id: 2aad1389-ed76-4736-abcb-fbd82bbf726c
last-correlation-id: 2aad1389-ed76-4736-abcb-fbd82bbf726c
last-transition-from: in-progress
---

# x00721 — A command refuses a flag it does not read

## goal

A CLI command says so when it is given a flag it does not read, names the
one the caller most likely meant, and runs nothing. `<command> --help`
prints that command's usage and flags instead of running it.

## why

On 2026-09-28 reviewers ran `proposals review-queue --proposalId=f00552`,
spelling the flag the way the tool's schema spells the field. The command
reads `--proposal`, dropped `--proposalId` without a word, and returned the
whole backlog; the reviewer read it as the answer about f00552. Another ran
`proposals review-queue --help` and got the queue: `--help` after a
command was dropped the same way. `--offset` did not exist.

The `work` command was listed twice, by itself and by the lazy entry that
loads it. Their usage lines had already drifted apart.

## why this design

- **A command declares its flags** (`ICliCommand.flags`). The dispatcher
  refuses any other flag before the command runs, except the global ones,
  and suggests the declared flag it matches ignoring case, dashes and
  underscores, or by prefix (`--proposalId` → `--proposal`).
- **`--help` or `-h` after a command prints its help**: summary (translated
  like the global help), usage and flags. A command that renders its own
  help declares `help`.
- **Declarations cannot drift.** A spec reads each command's `run` and
  fails on a flag it reads but does not declare, and checks `work`'s whole
  module. Every `proposals` command and `work` declare theirs; a command
  that declares none is not judged, so no other command changes.
- **One descriptor for `work`** (`WORK_COMMAND`), shared by the command and
  its lazy entry.
- `review-queue` gains `--offset` and `--detail`, which its tool takes.

## non-goals

- Declaring flags for every other command group in this proposal.

## architecture

- `packages/cli/src/contracts/interfaces/cli-command.interface.ts` (`flags`).
- `packages/cli/src/lib/command-flags.service.ts`, `packages/cli/src/index.ts`.
- `packages/cli/src/commands/groups/proposals.ts`,
  `packages/cli/src/commands/work.command.ts`,
  `packages/cli/src/commands/groups/core.ts`,
  `packages/cli/src/contracts/constants/work-command.constant.ts`.

## Slices

- global_gate: none

### S1 — Declared flags, refused strangers, per-command help

- **Status**: review
- **Gate**: `npx vitest run --project @delendai/cli`
- **Files**:
  - `packages/cli/src/contracts/interfaces/cli-command.interface.ts`
  - `packages/cli/src/lib/command-flags.service.ts`
  - `packages/cli/src/lib/command-flags.service.spec.ts`
  - `packages/cli/src/index.ts`
  - `packages/cli/src/index.spec.ts`
  - `packages/cli/src/commands/groups/proposals.ts`
  - `packages/cli/src/commands/work.command.ts`
  - `packages/cli/src/commands/groups/core.ts`
  - `packages/cli/src/contracts/constants/work-command.constant.ts`

## dependency graph

None.

## acceptance

- `proposals review-queue --proposalId=x` exits with a usage error naming
  `--proposal`, and calls no tool.
- `proposals review-queue --help` prints its usage and flags, and calls no
  tool.
- `work enter --proposal-id=x` is refused, naming `--proposal`.
