---
id: x01021
title: "The keep-the-queue-moving workflow says which of three reasons it is red"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-04
last-transition-id: b01b35ef-2a83-442b-b032-9629f8a2b1b1
last-correlation-id: b01b35ef-2a83-442b-b032-9629f8a2b1b1
last-transition-from: review
last-transition-at: 2026-11-04T21:45:52.610Z
---

# x01021 — The keep-the-queue-moving workflow says which of three reasons it is red

## goal

The workflow reports an internal error, a blocked queue and an open security alert as three separate states, so a red run says what to do.

## why

External audit (ChatGPT, 2026-11-04, against develop f7f53bf8d), finding 3. Claim: the keep-the-queue-moving workflow is red for three different reasons that look the same. Verified by reading `.github/workflows/keep-the-queue-moving.yml` (not by reproducing red runs): the report step (`keep-the-queue-moving.script.ts`), `work:doctor -- --forge` and `forge:promotion-alerts -- --branch=develop` each end the job red with their own output, and nothing in the run's summary names which state it is. A person has to open three logs to tell a script crash from a queue waiting on the owner from a code-scanning alert. The open alerts themselves are triaged in their own proposal.

## non-goals

- Making any of the three checks softer; each still fails the job.
- Triaging the open code-scanning alerts, which has its own proposal.

## slices

- global_gate: none

### S1 — The report script prints one state line
- **Status**: pending
- **Files**: `tools/scripts/forge/keep-the-queue-moving.script.ts`
- **Gate**: type
- acceptance:
  - "The script ends with exactly one line naming its state: internal-error (it threw), queue-blocked (candidates wait on a person or a red develop) or ok; a spec covers each."
- shipped-in: `cb62d7939ec9`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — Rework required: no post-shipped drift was observed for this slice, but this submission currently lacks attached reproducible current-develop evidence proving all three terminal state outputs (internal-error, queue-blocked, ok) including the claimed specs. Please re-run and attach fresh empirical proof before re-submitting.

### S2 — The workflow summary names the state of each step
- **Status**: pending
- **Files**: `.github/workflows/keep-the-queue-moving.yml`
- **Gate**: none
- acceptance:
  - "The run summary lists internal error, queue blocked and open security alert as three separate lines, each pass or fail, and the job stays red when any fails. The workflow is generated: the slice edits its generator source if it has one."
- shipped-in: `3eedd5a4857f`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — Rework required: no post-shipped drift was observed for this slice, but this submission currently lacks attached reproducible current-develop evidence that workflow summary lines separately report internal-error, queue-blocked, and open-security-alert states while preserving failing behavior. Please attach fresh empirical proof before re-submitting.

## acceptance

- The script ends with exactly one line naming its state: internal-error (it threw), queue-blocked (candidates wait on a person or a red develop) or ok; a spec covers each.
- The run summary lists internal error, queue blocked and open security alert as three separate lines, each pass or fail, and the job stays red when any fails. The workflow is generated: the slice edits its generator source if it has one.
