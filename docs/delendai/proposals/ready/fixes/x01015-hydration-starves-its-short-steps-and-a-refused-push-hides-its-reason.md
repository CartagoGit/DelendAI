---
id: x01015
title: "Hydration starves its short steps and a refused push hides its reason"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-03
---

# x01015 — Hydration starves its short steps and a refused push hides its reason

## goal

A long candidate refresh never holds back certify-integration or advance-queue, and a refused push reports the refusal rather than an informational banner.

## why

On 2026-11-03 one hydration pass sat for 2 hours: refresh-candidate-artifacts waited about an hour for the proof slot behind agents' delivers, holding the single hydration lock. Every later pass logged 'another hydration is running' and skipped, so the merge of #1707 (develop at b49221bce) got no full CI run for 50 minutes and the queue armed nothing. Separately, a refused push in refresh-candidate-artifacts reported only the first stderr line, which in .cache/delendai/hydrate-candidates.log is the error-reporting banner '[delendai] error-reporting is ON: ...' and not the refusal reason, so a candidate stayed behind with no way to learn why.

## non-goals

- Running two refreshes at once.
- Changing the proof slot or how delivers queue for it.
- Changing what the refresh merges or pushes.

## slices

- global_gate: none

### S1 — Short steps run under their own lock
- **Status**: pending
- **Files**: `tools/scripts/git/hydrate-candidates-after-merge.script.ts`, `tools/scripts/git/hydrate-candidates-after-merge.script.spec.ts`
- **Gate**: none
- acceptance:
  - "certify-integration and advance-queue run under a lock of their own on every pass, even while a refresh holds the long lock, and two refreshes never run at once; a spec pins the quick steps and their short timeouts."

### S2 — A refused push reports the refusal
- **Status**: pending
- **Files**: `tools/scripts/git/refresh-candidate-artifacts.script.ts`, `tools/scripts/git/refresh-candidate-artifacts.script.spec.ts`
- **Gate**: none
- acceptance:
  - "pushRefusalReason skips informational [delendai] banner lines and reports the refusal itself; a spec feeds the error-reporting banner followed by a rejection and sees the rejection."

## acceptance

- certify-integration and advance-queue run under a lock of their own on every pass, even while a refresh holds the long lock, and two refreshes never run at once; a spec pins the quick steps and their short timeouts.
- pushRefusalReason skips informational [delendai] banner lines and reports the refusal itself; a spec feeds the error-reporting banner followed by a rejection and sees the rejection.
