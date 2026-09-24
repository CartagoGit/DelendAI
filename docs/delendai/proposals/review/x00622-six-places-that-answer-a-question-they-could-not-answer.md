---
id: x00622
title: "Six places that answer a question they could not answer"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-23
shipped-in: ["ef8fe9d77"]
---

# x00622 — Six places that answer a question they could not answer

## goal

Each of these six sites turns "I don't know" or "I didn't check" into a
confident answer, or says something the code does not do. Each one should
say what it actually knows. They are grouped here because they share that
shape and are each small, not because they share code.

## why

An external review of `develop` reported them. Each was reproduced
against `develop` at `d43f019df` before it was written down here. None
is a crash. Each is a place where the product reports something its own
code contradicts, or reports a guess as knowledge. The project removed
that same failure from its policy guard (x00558: an unreadable policy
must not mean "allow everything").

1. **The adoption plan says `init` never writes a skill.**
   `init-adoption-plan.builder.ts` renders "`init` never writes, deletes,
   or moves a skill here", while `writeCoreSkillProjection` writes the
   bundled skills, and x00618 measured it: plan 8, disk 8. What `init`
   actually never touches is the project's *own* skills.
2. **A failed discovery is cached as the answer.** `serverPrefix` caches
   the promise per context, including one that resolved to `undefined`
   because `listTools()` threw once. For the rest of that context, a
   hidden tool is reported as unreachable because of one transient error.
3. **An unreadable proposals directory counts as zero proposals.**
   `countProposalsOnDisk` treats a directory it cannot read as empty.
   That count decides between "the index is stale, sync it" and "there
   is no backlog, create a proposal". If an unreadable directory counts
   as zero, an agent can be told to create work that already exists.
4. **`tool_search` filters by one reading of the query and ranks by
   another.** The filter splits the query into tokens and requires all
   of them (x00604). The score compares the *whole phrase* against the
   id, name, tags and summary. So nearly every multi-word query scores
   0 for every candidate and is ordered alphabetically. That is two
   definitions of one query.
5. **The adoption plan reads the target's plugins and discards them.**
   `buildToolUnification` awaits `readTargetPlugins(reader)` and ignores
   the result. Its comment says the target's plugins "are merged into
   ours", but nothing merges them there. Either the read matters and its
   result must be used, or it is I/O done only to look intentional.
6. **The queue workflow refreshes refs whose pull requests are already
   merged.** `keep-the-queue-moving` reports, then refreshes candidates,
   then runs the doctor, and reaps last. So a merged PR's ref gets a
   refresh attempt ("push refused"), the doctor reports
   `candidates-hydrated` broken, and seconds later the reaper deletes the
   ref. It wastes work and produces a red signal about something that
   was already finished.

## non-goals

- Changing what any of these computes when it *does* know.
- New configuration. None of these needs a switch; each needs to say the
  truth.

## Slices

- global_gate: none

### S1 — The adoption plan says which skills `init` writes

- **Status**: done — the spec now pins the true sentence and that the old claim is gone
- **Gate**: `npx vitest run packages/cli/src/lib/init`
- **Files**: `packages/cli/src/lib/init/init-adoption-plan.builder.ts`,
  `packages/cli/src/lib/init/init-adoption-plan.builder.spec.ts`
- The plan says `init` writes the bundled core skills and never moves,
  deletes or rewrites the project's own. The spec used to pin the word
  `advisory`, i.e. the false claim itself.


### S2 — A failed discovery is not remembered

- **Status**: done — a first failing `listTools()` answers `undefined`, the next call succeeds and is cached
- **Gate**: `npx vitest run packages/cli/src/lib/helpers/tool-request.service.spec.ts`
- **Files**: `packages/cli/src/lib/helpers/tool-request.service.ts`,
  `packages/cli/src/lib/helpers/tool-request.service.spec.ts`
- Only a discovered prefix is cached.


### S3 — "Cannot read" is not "nothing there"

- **Status**: done — an unreadable directory (a permission-locked subdirectory, and a file where the directory should be) answers `unreadable`, and `continue_proposal` then never says to create a proposal
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/proposals/backlog-on-disk.spec.ts plugins/proposals/tests/src/lib/continue-proposal.spec.ts`
- **Files**: `plugins/proposals/src/lib/proposals/backlog-on-disk.ts`,
  `plugins/proposals/src/lib/contracts/interfaces/backlog-on-disk.interface.ts`,
  `plugins/proposals/src/lib/tools/continue-proposal.tool.ts`,
  `plugins/proposals/tests/src/lib/proposals/backlog-on-disk.spec.ts`,
  `plugins/proposals/tests/src/lib/continue-proposal.spec.ts`
- `probeProposalsOnDisk` answers `ok(count) | missing | unreadable(dir,
  reason)`, from `safeListDir`'s own `readFailed`, which the old count
  ignored.


### S4 — One reading of the query, for filtering and for ranking

- **Status**: done — the new case (`close proposal`) ranks the tool whose name holds both words above an alphabetically earlier loose match; under the old whole-phrase score both scored 0
- **Gate**: `npx vitest run packages/core/tests/src/lib/project`
- **Files**: `packages/core/src/lib/project/tool-surface-runtime.service.ts`,
  `packages/core/tests/src/lib/project/tool-surface-runtime.search.spec.ts`
- The whole-phrase signals keep their weights, so one-word queries and
  exact ids rank as before; per-token hits and a same-field bonus are
  added on top, from the same `queryTokens` the filter uses.


### S5 — The adoption plan uses what it reads, or does not read it

- **Status**: done — the result is used: enabled plugins the project declares are merged into `ours`
- **Gate**: `npx vitest run packages/cli/src/lib/init`
- **Files**: `packages/cli/src/lib/init/init-adoption-plan.builder.ts`,
  `packages/cli/src/lib/init/init-adoption-plan.builder.spec.ts`
- `ourPlugins` is the preset plus extras and did not include what the
  project already declares, so the read was not redundant; its result is
  now merged, deduplicated. The init integration test then showed that
  the generated config lists every catalog plugin, enabled or not, so
  only entries that are not switched off count.


### S6 — Finished refs are reaped before live ones are refreshed

- **Status**: done — the reap step now runs before the refresh; merged refs are gone before anything is brought forward, so the refresh and the doctor see only live candidates without a change to the script
- **Gate**: `bun run lint:workflow-yaml`
- **Files**: `.github/workflows/keep-the-queue-moving.yml`
- Order: report → reap → bring forward → doctor.

## acceptance

- Each slice starts from a spec that fails on `develop` for the reason
  stated above and passes after.
- No slice adds an option or a new source of the fact it corrects.
