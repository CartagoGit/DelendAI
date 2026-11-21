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
2. Edit, run the gates the slice names, commit in the worktree. Nothing reaches the ref
   from any other checkout: `checkpoint` refuses to take files from the shared checkout.
3. `delendai work deliver` proves the candidate in isolation, hands it over and publishes it;
   wait until it ends and never run `work publish` after it. The forge opens a pending pull
   request, and `delendai work status` shows its number. `action: publish` alone is for a unit
   that is not delivered.
4. A unit that will not be published ends with `action: retire` (its tip is kept).
5. `land` merges. Agents never merge by hand; pull requests are batched, and a culprit or
   needs-update label on yours means refresh your unit and deliver again.

## Decide in this order

- Unsure what is going on: `status` (your units), `swarm` (everyone's units, idle ones are
  adoptable), `doctor` (invariants that failed).
- Someone else holds the slice: `claim` tells you; do not enter it.
- Finished a slice: `deliver`. Abandoned: `retire`. Stale refs left behind: `reap`
  (dry-run first; `apply: true` only after reading it).

## Rules that bite

- Tests run through `delendai work prove` and never the whole suite: name the spec files you touched, or let `work prove` select them. Reviewers and implementers alike: an unfiltered `vitest run` is refused for agents.
- A refused `enter` prints no path. Do not continue in the shared checkout.
- Never edit the shared checkout. While it holds loose edits every work command and
  commit refuses; `rescue` keeps them under a ref and restores it.
- Use the same `topic` for `enter` and `publish`.
- Set `PAGER=cat` and `GIT_PAGER=cat` in agent shells: a pager in the shared checkout wrote a stray file twice.
- The agent id is lowercase, maker first, then version, then tier; no effort word.
- Never leave a unit idle: every work command is its heartbeat, and 30 minutes of silence
  lists it for adoption.

## Before you hand over

- Finish the work while the proposal is still `in-progress`: leaving that state publishes the unit on its own, with none of your gates run.
- End every proposal with an `## acceptance` section; a proposal without one fails the proposal lint.
- Run each acceptance line against what you delivered. A line that is no longer true is rewritten with what was cut and why; reviewers judge the text, and a mismatch is a bounce.
- Leave slices `pending` and add no `shipped-in` by hand: the review transition (`work deliver`) records both. Never move a finished proposal to `done` yourself; the author approving their own closure removes the only independent check.
- On a resubmit, say in the note what answered the request.

## Ending and recovering units

- Every unit ends in `publish` or `retire`; a tip is never kept under a hand-made ref and a ref is never deleted with raw git. If the product cannot clean something, that is a missing command: file it, do not script around it.
- `retire` refuses uncommitted changes; `work retired --drop` removes read, spent work.
- `delendai work reap --apply` ends landed units of idle owners, removes stranded or rescued refs already on develop, keeps stray files in the worktrees directory and removes old empty test temp directories. Never delete refs or worktrees by hand; `work retire` ends the rest.
- Before ending a batch of delegated units, list worktrees and your agents' wip refs: each is published, being resumed or abandoned on purpose. After a quota or rate-limit failure, resume the agent with its unit ref.
- A different `--generation` is a deliberate second attempt; use it only after reading the refusal that names the existing unit.
- A worktree that reports `Cannot find module` in files you did not touch needs its dependencies installed or linked before you judge the change.
- In a script, take the path from `enter --print-path` and guard it (`[ -n "$W" ] && [ -d "$W" ] || exit 1`) before any git command: an empty path makes `cd` a no-op and the rest runs in the shared checkout.
- A write that replaces a file destroys the existing one without a trace. List the path first; create only what is absent.
- Anything that departs from this workflow (naming drift, a claim that did not exclude, a unit nobody ended) is evidence of a system defect: record it with its evidence in a proposal so it becomes a refusal, and do not just work around it.

Shipped proposals sent back for fresh evidence are re-validated with `delendai work revalidate`, one unit and one pull request for the batch, not one unit each; approving the batch is a later review batch.

## Waiting on long work

`prove`, `deliver` and `publish` can wait their turn for the machine's proof slot. Wait
for them one way, once:

- Start the long command (`deliver`, `prove`, `publish`) once, with the host's own
  background mechanism (Claude Code: `run_in_background: true`), and wait for the host's
  completion notification. Never poll. A host with no notification gets one blocking
  call with a timeout, never a loop.
- Never wait on a pattern that can match the waiter itself. `pgrep -f '<command>'`
  finds its own shell and never ends.
- Start a waiter once, never again on each turn, and stop every waiter you started
  before you report. A leftover waiter keeps the machine busy and wakes whoever started
  it, and each wake costs a read of that agent's whole context.
- Never start a second `deliver` of the same unit: the compute slot already joins
  callers of the same tip. Do not start a second `prove` or `publish` either.

## Running one gate of the proof

A failed proof ends each failure with `delendai work prove --only=<gate>`. Run that from the
unit's worktree to repeat just that gate, with the inputs, commands and order the proof uses
(`--only=a,b` for several); an unknown name exits 2 and lists the valid ones. It takes the
machine's compute slot only for the test and coverage gates. It never proves the unit: the
last line says "partial: the unit is not proved", and `work deliver` still runs the whole proof.

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
