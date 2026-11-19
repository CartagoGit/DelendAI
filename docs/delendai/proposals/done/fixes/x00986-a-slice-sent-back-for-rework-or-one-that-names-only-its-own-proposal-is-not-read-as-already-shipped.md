---
id: x00986
title: "A slice sent back for rework, or one that names only its own proposal, is not read as already shipped"
kind: fix
status: done
type: proposal
track: governance
date: 2026-10-27
last-transition-id: c5fdd2c5-b64a-4527-a974-76a5743484fb
last-correlation-id: c5fdd2c5-b64a-4527-a974-76a5743484fb
last-transition-from: review
last-transition-at: 2026-11-04T15:51:33.853Z
shipped-in:
  - "8ef9ed654"
---

# x00986 — A slice sent back for rework, or one that names only its own proposal, is not read as already shipped

## goal

`lint:proposal-already-implemented` reports a pending slice as shipped only when it may be: never one a reviewer returned for changes, and never on the strength of the proposal document itself.

## why

On 2026-10-27 the lint failed on develop with five findings, and failed lint-governance for every pull request that touched a proposal (#1519 among them):

- f00783 S3–S6 were returned from review with `review-state: changes_requested`. Their files exist from the first delivery and the frontmatter has a `shipped-in`, so the lint called them "already-shipped" and told the author to flip them to done: the opposite of what the reviewer asked.
- q00035 S1 is a plan's closing slice, whose only file is the plan document. That file is always tracked, so the lint read it as delivered and asked for a `shipped-in`.

## non-goals

- The classification of slices that modify files older than their proposal.

## slices

- global_gate: type

### S1 — Rework and self-named files are not evidence
- **Status**: done
- **Files**: `tools/scripts/lint/proposal-already-implemented.script.ts`, `tools/tests/lint/proposal-already-implemented.spec.ts`
- **Gate**: type
- acceptance:
  - "A pending slice with `review-state: changes_requested` is not reported, whatever its files and the frontmatter's shipped-in say."
  - "A slice's reference to its own proposal file is not counted among its files; a slice that names only that file is not reported."
  - "On develop at 2026-10-27 the lint passes with f00783 S3–S6 and q00035 S1 still pending."
- shipped-in: `8ef9ed654`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.3-codex
- review-log: approved by gpt-5.3-codex — verified at 8ef9ed654, validate exit 0 and tests 12/12 claimed, no recorded run cited; acceptance 3/3: (1) proposal-already-implemented.spec.ts passed including case: does not read a slice a reviewer sent back as already shipped. (2) proposal-already-implemented.spec.ts passed and shipped commit updates parser/classifier logic in tools/scripts/lint/proposal-already-implemented.script.ts plu… (3) Commit 8ef9ed654 is marked shipped-in for this fix and the lint/spec file pair changed together; local spec suite for proposal-already-implemented passes (12/1…

## acceptance

- A pending slice with `review-state: changes_requested` is not reported, whatever its files and the frontmatter's shipped-in say.
- A slice's reference to its own proposal file is not counted among its files; a slice that names only that file is not reported.
- On develop at 2026-10-27 the lint passes with f00783 S3–S6 and q00035 S1 still pending.

## notes

- 2026-10-27: this publication also carries c00536 (qs pinned past GHSA-6pq8-jhm2-2vcw). Each fix alone failed the other one's check on develop: this lint failed lint-governance on every pull request touching a proposal, c00536 included, and the advisory failed lint-security on every pull request, this one included.
