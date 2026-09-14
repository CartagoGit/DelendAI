---
id: f00536
title: "Context frugality as an enforced agent property, and automatic compaction of tool output"
kind: feat
status: ready
type: proposal
track: trust
date: 2026-09-10
tags:
    - context-budget
    - agent-policy
    - tool-output
    - compaction
---

# f00536 — Context frugality as an enforced agent property, and automatic compaction of tool output

## goal

An agent should spend its context on the problem, not on the transcript
of how it looked at the problem. Today nothing tells it what its own
tool output costs, so the cheapest command to write wins over the
cheapest to read.

## why

Observed directly, on this repository, during the `shared-checkout-pr`
migration: a session stayed at ~80% context immediately after a
compaction, and the operator called it out as unreasonable. It was.

Compaction cannot reduce the fixed floor — system prompt, tool
definitions, `CLAUDE.md`, the skills catalogue. What it *can* reduce is
everything the agent itself put there, and that turned out to be the
dominant term. The four habits that filled it were all avoidable:

1. **Unbounded log capture.** `gh run view --log-failed | tail -25` when
   a single filtered line carried the answer. CI logs are the worst
   offender: each one is thousands of tokens and the useful content is
   usually one assertion.
2. **Whole-file reads for a single symbol.** `cat` on a 400-line module
   to look at one function, when the line range was known.
3. **Long commit bodies.** They land in the transcript twice — once when
   written, once in the confirmation — and this repository rewards
   explanatory commits, so the cost compounds.
4. **Re-verification.** Re-reading a file that was just edited, or
   re-running a check that already passed, on the theory that it was
   cheap. It is not.

None of that is a model limitation. It is an absence of budget pressure:
nothing in the loop ever tells an agent what its output costs, so the
cheapest-to-write command wins over the cheapest-to-read one.

This matters beyond ergonomics. A session that burns its context on tool
transcript has less room for the problem, compacts more often, and each
compaction loses fidelity. The failure mode is not "runs out" — it is
"gets progressively worse at the task while appearing to work".

## non-goals

- Not a token-count display. A number nobody can act on changes nothing.
- Not automatic conversation compaction on a timer. Compaction loses
  fidelity; doing it *more* is the wrong direction. The point is to have
  less to compact.
- Not a smaller model or a shorter system prompt. The floor is not where
  the waste is.

## architecture

Two halves, and the second is worthless without the first.

### 1. Make the cost visible and then enforceable

- Measure it. Attribute consumed context to its source: tool results by
  tool and by call site, prompt scaffolding, model output. Without
  attribution every conversation about this is anecdote — including this
  one, which rests on an eyeballed percentage.
- Surface a per-session budget the way `tokens:gate` already surfaces a
  preset budget, with the same ratchet posture: a run may not consume
  materially more transcript than the recorded floor without saying so.
- Then, and only then, a lint: no unbounded `--log-failed`, no `cat` of
  a tracked source file where a range would do. A guard written before
  the measurement exists would be guessing at the threshold.

### 2. Compact tool output at the seam, not after the fact

Waiting for conversation-level compaction is too late — the tokens have
already been spent, and the summary of a log dump is itself large.
Compaction belongs where the output is produced:

- **Cap and elide by default**, with the elision *stated*: `[… 412 lines
  omitted, filtered on /error|fail/ …]`. Silent truncation is worse than
  none, because it invites a conclusion drawn from a partial read.
- **Structure-aware summarisation for known shapes.** A CI log is not
  prose: it has jobs, steps and one or two assertions that matter. A
  test run has a pass/fail tally and the failing names. Collapsing those
  to their skeleton is lossless for the decision being made.
- **Keep the full artefact addressable.** Write it to the scratchpad and
  hand back the path, so the agent can go deeper when the summary is not
  enough. Elision must never mean unavailable.

## slices

### S1 — Attribute the cost

- **Status**: pending
- **Files**: [`packages/core/src/lib/context-budget/`, `tools/scripts/lint/context-budget.script.ts`]

Measure where context goes: tool results by tool and by call site,
prompt scaffolding, model output. Report it per session. Nothing else in
this proposal can be justified — or sized — until this exists, and the
observation that started it was an eyeballed percentage.

- **Gate**: `npx vitest run packages/core/tests/src/lib/context-budget`
- **Expect**: the attribution sums to the measured total.

### S2 — Elide at the seam, keep the artefact

- **Status**: pending
- **Files**: [`packages/core/src/lib/context-budget/elide-tool-result.ts`]

Cap tool results, state the elision in the result itself, and write the
full output to the scratchpad so the path comes back with it. Silent
truncation is worse than none: it invites a conclusion drawn from a
partial read.

- **Gate**: `npx vitest run packages/core/tests/src/lib/context-budget/elide-tool-result.spec.ts`
- **Expect**: the elision is stated and the named artefact holds the full output.

### S3 — Summarise the shapes that dominate

- **Status**: pending
- **Files**: [`packages/core/src/lib/context-budget/summarise-ci-log.ts`]

CI logs and test runs are structure, not prose: jobs, steps, a tally,
and the one or two assertions that matter. Collapse them to that
skeleton.

- **Gate**: `npx vitest run packages/core/tests/src/lib/context-budget/summarise-ci-log.spec.ts`
- **Expect**: the failing assertion and its job name survive the summarisation.

### S4 — State the rules, then enforce them

- **Status**: pending
- **Files**: [`docs/delendai/AGENT-BOOTSTRAP.md`, `tools/scripts/lint/context-budget.script.ts`]

Put the concrete habits in the agent instructions (`grep | head`, line
ranges, no re-verification of a just-written file), then add the guard
that fails a run consuming materially more transcript than the recorded
floor — with the same ratchet posture as `tokens:gate`.

- **Gate**: `bun tools/scripts/lint/context-budget.script.ts`
- **Expect**: exit 0 on the recorded floor, nonzero when a run exceeds it.
## acceptance

- Context attribution exists and is reported per session: which tools,
  which call sites, how much.
- A tool result over the cap comes back elided, with the elision stated
  and the full artefact addressable by path.
- CI logs and test runs specifically come back as structure, not as
  transcript, and a spec proves the failing assertion survives the
  summarisation.
- The agent instructions state the frugality rules concretely enough to
  follow (`grep | head`, line ranges, no re-verification) rather than as
  an exhortation to be brief.
- Measured on a real session: the same task consumes materially less
  transcript than the recorded baseline, and the guard fails when it
  does not.

