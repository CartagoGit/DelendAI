---
name: delendai-work-unit-playbook
plugin: proposals
tools: ['delendai_work']
appliesTo: ['@delendai/proposals']
description: How to run a unit of work with the work tool: enter, checkpoint, publish or retire, so shared files are never edited in place and every unit ends. Read before the first edit of a proposal slice.
---

# work unit playbook

One call, `delendai_work`, with an `action`. A unit is one proposal slice in its own
worktree and its own work ref. The shared checkout only follows `develop`; nothing is
edited there.

## The path of a unit

1. `action: enter` with `proposal`, `slice` and `agent` (your exact model id). It prints the
   worktree path. Edit and commit only there, and pass it as `checkout` to other tools.
2. Edit, run the gates the slice names, commit in the worktree. `action: checkpoint` with
   `paths` and `message` writes the same ref from the shared checkout without moving HEAD.
3. Prove the candidate in isolation, then `action: publish`. It pushes the pull request
   branch and opens the pull request into `develop`.
4. A unit that will not be published ends with `action: retire` (its tip is kept).

## Decide in this order

- Unsure what is going on: `status` (your units), `swarm` (everyone's units, idle ones are
  adoptable), `doctor` (invariants that failed).
- Someone else holds the slice: `claim` tells you; do not enter it.
- Finished a slice: `publish`. Abandoned: `retire`. Stale refs left behind: `reap`
  (dry-run first; `apply: true` only after reading it).

## Rules that bite

- A refused `enter` prints no path. Do not continue in the shared checkout.
- Use the same `topic` for `enter` and `publish`.
- The agent id is lowercase, maker first, then version, then tier; no effort word.
- Never leave a unit idle: every work command is its heartbeat, and 30 minutes of silence
  lists it for adoption.

## Checkpoint advisories

When any delendai tool result carries `checkpointAdvisory` in the result
`_meta` (the protocol metadata channel — never `structuredContent`, which is
schema-validated) with `triggered: true`:

1. Surface `checkpointAdvisory.message` to the user **verbatim**. Do not
   silently consume or paraphrase it.
2. Explain the reason in at most one short sentence.
3. Follow `nextAction` unless the user explicitly asks to continue.
4. Never repeat the same advisory until its `dedupeKey` changes.

Every visible recommendation begins with **At this point, I recommend**.

**Agent-enforced fallback (host-private terminals):** if you run two or more
equivalent validation cycles without a meaningful implementation delta, treat
it as a micro-validation loop and surface the same advisory. That signal is
agent-enforced; server-observed validation is whatever MCP quality/git tools
the server can see. See `docs/delendai/CHECKPOINT-ADVISORIES.md`.

Preferred fresh-session sequence: coherent boundary → semantic checkpoint →
persist proposal/slice state → release unnecessary locks → new session →
orient → resume from `memory_checkpoint_packet`. Session age by itself must
never hard-block work.
