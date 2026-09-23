---
id: x00606
title: "A stale index is not an empty backlog"
kind: fix
status: review
type: proposal
track: swarm
date: 2026-09-23
tags:
    - agents
    - proposals
---

# x00606 — A stale index is not an empty backlog

## goal

`auto_work` never tells an agent to write a proposal that already
exists.

## why

Driven through the MCP surface in a consumer project holding exactly one
proposal — `ready`, with a pending slice — whose index had simply never
been built:

```
delendai_proposals_auto_work:
  {"state":"idle","reason":"no actionable proposal in the index",
   "nextAction":"Create a proposal under the proposals dir and run sync_proposals."}
```

Run `sync_proposals` first and the same call answers
`{"state":"work","proposalId":"x00001",…}`. The machinery is right. The
**diagnosis** is not.

An agent that follows that `nextAction` writes a second proposal for work
that is already written. And a duplicate id is a documented way to
freeze this repository's entire index — the failure x00529 exists
because of, where one stale file froze the whole sweep.

"There is no work" and "I have not looked properly" are different
answers, and only one of them means create something.

## non-goals

- Syncing from inside `auto_work`. A read that writes is how a hot path
  becomes a surprise, and `sync_proposals` is one call away.

## architecture

`countProposalsOnDisk(proposalsDirAbs)` counts markdown files at any
depth. When the index yields nothing actionable and the directory holds
more files than the index knows entries, the answer changes:

```
reason:     the index knows 0 proposal(s); the proposals dir holds 1 file(s)
nextAction: Run sync_proposals: the index is behind the proposals on
            disk. Do NOT create a proposal — the work may already be
            written.
```

It **counts** files and never parses them. The question is whether the
index is plausibly complete, and a file the index missed because it is
broken is exactly the case an agent must not paper over by writing
another one — more urgently, not less.

Without `proposalsDirAbs` there is nothing to compare against, and the
old answer stands rather than a guess.

## slices

### S1 — the two answers are told apart

- **Status**: review
- **Files**: [`plugins/proposals/src/lib/proposals/backlog-on-disk.ts`, `plugins/proposals/src/lib/contracts/constants/backlog-on-disk.constant.ts`, `plugins/proposals/src/lib/tools/continue-proposal.tool.ts`, `plugins/proposals/tests/src/lib/proposals/backlog-on-disk.spec.ts`, `plugins/proposals/tests/src/lib/continue-proposal.spec.ts`]
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/continue-proposal.spec.ts plugins/proposals/tests/src/lib/proposals/backlog-on-disk.spec.ts`

## acceptance

- An empty index over a directory holding one proposal answers with the
  counts and `Do NOT create a proposal`.
- An empty index over an empty directory still says `Create a proposal`.
- Without `proposalsDirAbs`, the old answer stands.
- The counter sees proposals at any depth, counts an unparseable file,
  ignores non-markdown, and answers zero for a missing directory.

## risks and mitigations

- **A directory with many `.md` files that are not proposals.** The count
  is only ever compared with the index's own, and the consequence of
  over-counting is advice to run `sync_proposals` — which is harmless and
  idempotent.

## notes

The third defect of this shape found by driving the real surface in a
consumer project, after x00602 (the guard naming a branch that does not
exist) and x00605 (a plugin's requirement reported as the project's
fault). Each one is delendai telling somebody else's project something
untrue about itself, and this is the only one where following the advice
creates garbage.
