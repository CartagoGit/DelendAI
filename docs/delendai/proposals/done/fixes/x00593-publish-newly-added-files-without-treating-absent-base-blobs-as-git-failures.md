---
id: x00593
title: "Publish newly added files without treating absent base blobs as Git failures"
kind: fix
status: done
type: proposal
track: batuta
date: 2026-09-21
shipped-in: [99b9a26d61c765e0c4d0e00c8ef728d2efc53719]
---

# x00593 — Publish newly added files without treating absent base blobs as Git failures

## goal

A file that does not exist yet publishes like any other.

## why

Publication compares object ids rather than diffs, on purpose: an id
comparison cannot be talked out of by an agent that misread the rule, and
a path edited to match what already landed upstream is correctly not
stale.

The comparison was read with `git rev-parse <rev>:<path>`, which does not
answer "absent" — it **fails**. For a path the candidate is ADDING, that
is the normal case, and the guard reported a git error instead of a new
file. The publication of a newly added file could not succeed.

Found by the batuta registration work, which is the first thing in a
while to publish a file that had never existed.

## non-goals

- Relaxing the stale-content guard. A path that exists upstream and
  changed independently is still refused; only the absent case changes.
- Tolerating a bad revision. An unreadable `<rev>` is still an error,
  because it means the caller asked about something that is not there —
  which is a different statement from "this path is not there yet".

## architecture

`readTreeObjectId(revision, path)` reads the entry with `ls-tree -z`,
which prints nothing for a path the tree does not hold and prints a
parsable entry for one it does. Empty output is `undefined` — an
addition. Output that does not parse is an error, because git answered
something and it was not an entry.

`-z` and `--literal-pathspecs` are not decoration: a filename may contain
a tab, a newline or a glob character, and each of those silently
corrupts the other spellings.

## slices

### S1 — distinguish a new path from a git lookup failure

- **Status**: done
- **Files**: [`tools/scripts/forge/publish-candidate.script.ts`, `tools/scripts/forge/publish-candidate.script.spec.ts`]
- **Gate**: `npx vitest run tools/scripts/forge/publish-candidate.script.spec.ts`

## acceptance

- An added path absent from both HEAD and the integration branch is
  accepted by stale detection rather than reported as a git failure.
- Existing blobs are still compared by object id, including paths with
  spaces.
- An invalid revision still fails.
- The publication invariants are unchanged: no branch switch, no gate
  bypassed. 47 focused tests pass.

## risks and mitigations

- **An `ls-tree` output shape this parser does not recognise.** It
  throws rather than guessing, so an unparsed entry surfaces as a
  refusal to publish instead of a silent "not stale".

## notes

Recovered from `delendai/wip/codex-astra-6/f00551-S0-g1/…`, a work ref
that `lint:ref-lifecycle` found carrying unreviewed work with no pull
request. Its proposal claimed id `x00583`, which was already taken by a
merged proposal; it is renumbered here. The code and its tests are as
codex-astra-6 wrote them.
