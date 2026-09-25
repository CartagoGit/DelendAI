---
id: x00655
title: "A candidate red only on derived files is regenerated"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-25
priority: P1
related: [x00650, x00653]
---

# x00655 — A candidate red only on derived files is regenerated

## goal

A pull request whose only failures are stale derived files is made
green by the machine that owns derived files, instead of waiting for
its author.

## why

On 2026-09-25 a reviewer (qwen) published its q00014 verdicts
canonically, as #466. It was level with `develop` and red on `drift`
and `lint-presets` only, because `agent-catalog.generated.json` had not
been regenerated. x00650 gives a red candidate that is level to its
author, so #466 would have waited for its author, for a file nobody
authors: `gen:all` produces it.

The hydrator already regenerates on every refresh:
`refreshCandidate` merges the integration branch (a no-op when level),
runs `gen:all`, and commits what changed. Only the rule was missing.

## why this design

`candidate-disposition.ts` gains `regenerate` for a red candidate
whose failing checks are all ones a stale derived file fails:

- `drift` and `lint-presets`;
- the `delendai-validate` aggregate, which only counts alongside one of
  those two;
- only when the candidate's head is not already a regeneration.

If it is red again after that one regeneration, it is its author's, so
nothing loops.

- The failing checks travel with the queue facts (`failing`), read from
  the same check runs that decide `red`.
- The regeneration commit's subject is one constant
  (`REGENERATION_COMMIT_SUBJECT`). The refresh writes it, and the
  disposition reads it back.

## non-goals

- Fixing any failure that is not a derived file. Any other failing
  check leaves the candidate to its author.

## architecture

- `tools/scripts/forge/candidate-disposition.ts` (+ `.constant.ts`,
  `.interface.ts`): `regenerate`, `REGENERATION_FIXES_CHECKS`.
- `tools/scripts/forge/queue-order.interface.ts`,
  `keep-the-queue-moving.script.ts`: `failing` on the facts.
- `tools/scripts/git/refresh-candidate-artifacts.script.ts` (+
  `.constant.ts`): `REGENERATION_COMMIT_SUBJECT`; `headIsRegeneration`
  read from the candidate's head.

## Slices

- global_gate: none

### S1 — A candidate red only on derived files is regenerated once

- **Status**: review
- **Gate**: `npx vitest run tools/scripts/forge tools/scripts/git/refresh-candidate-artifacts.script.spec.ts`
- **Files**:
  - `tools/scripts/forge/candidate-disposition.ts`
  - `tools/scripts/forge/candidate-disposition.constant.ts`
  - `tools/scripts/forge/candidate-disposition.interface.ts`
  - `tools/scripts/forge/candidate-disposition.spec.ts`
  - `tools/scripts/forge/queue-order.interface.ts`
  - `tools/scripts/forge/keep-the-queue-moving.script.ts`
  - `tools/scripts/git/refresh-candidate-artifacts.script.ts`
  - `tools/scripts/git/refresh-candidate-artifacts.constant.ts`
  - `tools/scripts/lint/proposal-hygiene.script.ts`
  - `tools/scripts/lint/proposal-hygiene.spec.ts`

Found on the way: `proposal-hygiene` reported this proposal as a
duplicate of x00650. Its fingerprint read the text after `Files:` with
`\s*`, which ran across the line break and captured only the first item
of a multi-line list. Any two proposals whose lists started with the
same file counted as the same work. The fingerprint now reads the whole
list.

## dependency graph

None.

## acceptance

- A level candidate red only on `drift`/`lint-presets` (with or without
  the aggregate) is `regenerate` and is brought forward.
- Red again after its regeneration, it is `author`.
- Any other failing check, or the aggregate alone, leaves it `author`.
- Measured read-only on the live repository: #466 `regenerate — red only
  on lint-presets, drift`.
