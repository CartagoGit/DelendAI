---
id: x00622
title: "Six places that answer a question they could not answer"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-09-23
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

- **Status**: pending
- **Gate**: `npx vitest run packages/cli/tests/src/lib/init`
- **Files**: `packages/cli/src/lib/init/init-adoption-plan.builder.ts`
- The sentence states that the bundled core skills listed are
  materialised, and that the project's own skills are only inventoried
  and never moved, deleted or rewritten. A spec pins it against the
  projection, so the text cannot drift from what `init` writes again.

### S2 — A failed discovery is not remembered

- **Status**: pending
- **Gate**: `npx vitest run packages/cli/tests/src/lib/helpers`
- **Files**: `packages/cli/src/lib/helpers/tool-request.service.ts`
- Only a discovered prefix is cached. A `listTools()` failure answers
  `undefined` for that call and is asked again on the next.

### S3 — "Cannot read" is not "nothing there"

- **Status**: pending
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/proposals`
- **Files**: `plugins/proposals/src/lib/proposals/backlog-on-disk.ts`,
  `plugins/proposals/src/lib/tools/continue-proposal.tool.ts`
- The probe answers `ok(count) | missing | unreadable(reason)`. `missing`
  is a real empty backlog. `unreadable` never recommends creating a
  proposal; it names the directory and the error.

### S4 — One reading of the query, for filtering and for ranking

- **Status**: pending
- **Gate**: `npx vitest run packages/core/tests/src/lib/project`
- **Files**: `packages/core/src/lib/project/tool-surface-runtime.service.ts`
- The score is computed from the same tokens the filter uses: per-token
  hits in id, tag, name and summary, with bonuses for an exact id, all
  tokens in one field, and consecutive order. The spec's ordering case
  is a multi-word query that used to tie at 0.

### S5 — The adoption plan uses what it reads, or does not read it

- **Status**: pending
- **Gate**: `npx vitest run packages/cli/tests/src/lib/init`
- **Files**: `packages/cli/src/lib/init/init-adoption-plan.builder.ts`
- Decide from the callers whether `ourPlugins` is already the authority.
  If it is, drop the read. If it is not, merge the result the comment
  promises. The spec pins whichever answer is true.

### S6 — Finished refs are reaped before live ones are refreshed

- **Status**: pending
- **Gate**: `bun tools/scripts/forge/keep-the-queue-moving.script.ts --help`
- **Files**: `.github/workflows/keep-the-queue-moving.yml`,
  `tools/scripts/forge/keep-the-queue-moving.script.ts`
- The reap step runs before the refresh, and the refresh considers only
  refs with an open pull request, so the doctor never reports a finished
  ref as a broken invariant.

## acceptance

- Each slice starts from a spec that fails on `develop` for the reason
  stated above and passes after.
- No slice adds an option or a new source of the fact it corrects.
