---
id: f00536
title: "Context frugality as an enforced agent property, and automatic compaction of tool output"
kind: feat
status: review
type: proposal
track: trust
date: 2026-09-10
tags:
    - context-budget
    - agent-policy
    - tool-output
    - compaction
last-transition-id: 6f7c2fac-8643-4b03-985d-85a9d83d0d01
last-correlation-id: 6f7c2fac-8643-4b03-985d-85a9d83d0d01
last-transition-from: in-progress
shipped-in:
  - "03289da1e5f3"
  - "55eae8993498"
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

- **Status**: done
- **Files**: `packages/core/src/lib/metrics/context-attribution.helper.ts`,
  `packages/core/src/lib/contracts/interfaces/context-attribution.interface.ts`,
  `packages/core/src/lib/metrics/metrics-registry.ts`,
  `packages/core/src/lib/metrics/metrics-tool.ts`,
  `packages/core/src/generated/tool-outputs.ts`,
  `packages/core/tests/src/lib/metrics/context-attribution.spec.ts`

Measure where context goes: tool results by tool and by call site,
prompt scaffolding, model output. Report it per session. Nothing else in
this proposal can be justified — or sized — until this exists, and the
observation that started it was an eyeballed percentage.

- **Gate**: `npx vitest run packages/core/tests/src/lib/metrics/context-attribution.spec.ts`
- **Expect**: the attribution sums to the measured total.

Delivered for what a server can see. The `metrics` snapshot carries
`attribution`: the tool definitions `tools/list` served (f00272) and each
tool's responses, largest first, the five costliest tools by name and the
rest as `other tools`, summing exactly to `totalBytes` (a fast-check
property). "By call site" is the five largest single responses, with
tool and time. Prompt scaffolding and model output never pass through
the server, so they are the host's to measure, not this slice's.
- shipped-in: `03289da1e5f3`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-flash
- review-log: approved by glm-5.3-flash — verified at 03289da1e5f3, validate exit 0, tests 4/4 — Gate green: attribution spec 4/4; sums to totalBytes incl. tools/list + other tools (read the helper); shipped in #433 merge 03289da1e
- review-attribution: claude-opus-5-5 from commit 03289da1e5f3 names refs/heads/delendai/wip/claude-opus-5-5/f00536-S1-g1/the-cost-is-attributed (03289da1e5f3440c20a7be0f1d55fab8dc0d79ec), opened by glm-5.3-flash

### S2 — Elide at the seam, keep the artefact
- **Status**: done
- **Files**: [`packages/core/src/lib/context-budget/elide-tool-result.service.ts`, `packages/core/src/lib/shared/tool-response.ts`, `packages/core/src/lib/contracts/interfaces/truncation.interface.ts`, `packages/core/src/lib/contracts/constants/response-byte-budget.constant.ts`, `packages/core/src/lib/cli/assemble-core-tools.ts`, `packages/core/tests/src/lib/context-budget/elide-tool-result.spec.ts`]
The capping and the stated elision already existed (`truncateIfTooLarge`:
original size, cap and a structural head, never a cut mid-JSON). What
was missing was the other half: the rest of the output was discarded.
`toolJsonBounded` now keeps the full serialised result, content-
addressed, in the directory the host configures
(`<cacheDir>/results/tool-output`, set when core assembles its tools),
and the envelope carries `artifact`, the path — inside the byte cap.
Keeping it never fails the tool: an output that cannot be written comes
back as a stated elision without the path.
- **Gate**: `npx vitest run packages/core/tests/src/lib/context-budget/elide-tool-result.spec.ts`
- **Expect**: the elision is stated and the named artefact holds the full output.
- shipped-in: `55eae8993498`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-flash
- review-log: approved by glm-5.3-flash — verified at 55eae8993498, validate exit 0, tests 7/7 — Gate green: elide spec 7/7; full output kept content-addressed + artifact path inside cap, failed write drops path honestly (read service); shipped in #421 merge 55eae8993
- review-attribution: claude-opus-5-5 from commit 55eae8993498 names refs/heads/delendai/wip/claude-opus-5-5/f00536-S2-g1/elided-output-stays-addressable (55eae8993498be67c655bb4b65c07e84846e7f1c), opened by glm-5.3-flash

### S3 — Summarise the shapes that dominate
- **Status**: review — shipped in #422 (merge c6b96a4d0)
- **Files**: [`packages/core/src/lib/context-budget/summarise-ci-log.helper.ts`, `packages/core/src/lib/contracts/interfaces/ci-log-summary.interface.ts`, `packages/core/tests/src/lib/context-budget/summarise-ci-log.spec.ts`]
`summariseCiLog` reduces a job log or a test run to the job, the step
that failed, the tally, and each failing test with the first line that
says why. It reads GitHub Actions' timestamped lines and `##[group]` /
`##[error]` markers, vitest's and bun's output, and strips colour; a log
it does not recognise comes back `runner: 'unknown'` rather than
guessed at. Fixtures are the shapes CI printed on 2026-09-24: a 500-line
job log becomes under 1 KB with the failing assertion and job intact.
- **Gate**: `npx vitest run packages/core/tests/src/lib/context-budget/summarise-ci-log.spec.ts`
- **Expect**: the failing assertion and its job name survive the summarisation.
- shipped-in: `c6b96a4d0c19`
### S4 — State the rules

- **Status**: review
- **Files**: [`docs/delendai/AGENT-BOOTSTRAP.md`]
- **Gate**: `bun run lint:prompt-size && bun run lint:bootstrap-canonical`

The concrete habits are in the agent instructions. They replace the
"re-read discipline" point, which named one habit of the four: filter
output (`grep | head`, `--jq`), read line ranges, take the one failing
assertion from a CI log, keep commit bodies short, and never re-read a
file just written or re-run a check that passed. The bootstrap stays
inside its 32,000 B budget (31,922 B).
- shipped-in: `7fbff952e89c`

### S5 — Enforce them against a run's own transcript

- **Status**: retired — 2026-10-05. The guard needs the agent's own transcript, and only a host has it: no two hosts export it the same way and several export nothing. A guard built on one host's export would hold for that host alone, in a product that governs agents of any model on any host. What delendai can measure is measured and ratcheted already: S1 attributes the cost of its own tool responses, S2 and S3 cap and summarise them, and `tokens:gate` fails when one grows. S4 states the habits for what it cannot see. If hosts come to share a usage export, a new proposal takes it up against that format.
- **Files**: [`tools/scripts/lint/context-budget.script.ts`]
- **Gate**: `bun tools/scripts/lint/context-budget.script.ts`

The guard was to fail a run that consumes materially more transcript
than a recorded floor, with the ratchet posture of `tokens:gate`. What
it would measure is the agent's own transcript: shell output, whole-file
reads, CI logs, commit bodies. delendai sees only its own tool
responses. S1 attributes those, and the token dashboard already
ratchets them per tool. A guard over a scripted delendai task would
measure something other than the habits this proposal is about, and
pass while the habits stayed. Unblocked by a transcript source that
outlives the session: a host's per-session usage export, or a hook
that records it.

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
- Not delivered (S5, retired): a guard over the agent's whole
  transcript. delendai's own responses are ratcheted by `tokens:gate`;
  the rest of a transcript is the host's to measure.

## notes

Found closing it, on 2026-10-05:

- **Moving this proposal broke another one's check.** `x00654`, closed,
  cites this document by its `in-progress/` path. When this proposal
  moved to `review/`, `lint:proposal-slice-completeness` reported
  `x00654` as declaring a missing file. Nothing was wrong in either
  document. A declared path under `docs/delendai/proposals/` now counts
  as present when a proposal of that file name exists in any status
  folder (`tools/scripts/lint/lib/declared-path-exists.lib.ts`, used by
  both existence lints). Debt shrank: 356 → 327 dangling references,
  847 → 837 completeness issues.
- **A retired slice was asked for its files.** `proposal-files-exist`
  skipped only `pending` slices, so S5's planned script was reported as
  missing. A `retired` slice delivered nothing and is skipped too.

