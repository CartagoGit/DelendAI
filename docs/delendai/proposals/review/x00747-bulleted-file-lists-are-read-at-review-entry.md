---
id: x00747
title: "Bulleted file lists are read at review entry"
kind: fix
status: review
type: proposal
track: hosts
date: 2026-09-29
priority: P1
related: [x00745, x00746]
last-transition-id: b085145e-698a-4421-9470-c8e120c4ee94
last-correlation-id: b085145e-698a-4421-9470-c8e120c4ee94
last-transition-from: in-progress
---

# x00747 — Bulleted file lists are read at review entry

## goal

The completeness guard and the review entry read the same files for a
slice as the slice plan does, whatever form the `Files` field takes.

## why

Two parsers read a slice's `Files` field. The slice plan follows the
field's indented continuation lines. The completeness guard
(`collectSliceStatuses`) matched a regex line by line, so a list written
as sub-bullets under `- **Files**:` yielded no files at all. Measured on
f00640: the slice plan read 8 files for S2, and the guard read 0.

Every consumer of the guard inherited the blind spot:

- the move to review skips a slice with no files, so S2 got no
  `shipped-in` record and its review could not be attributed;
- the close check's missing-files test passed over every bulleted list.

Most recent proposals use the bulleted form, so the x00745 rule
("a slice enters review with its delivery recorded") did not apply to
them.

## why this design

- `readDeclaredSliceFiles(body)` in `expand-declared-files.ts` is the one
  reader. The slice plan's reader moved there unchanged, and
  `collectSliceStatuses` gathers each slice's body and calls it.
- The guard keeps only entries shaped like paths, so a placeholder such
  as `TBD` is not checked on disk.
- A `## ` heading ends the last slice, so a `Files` line in a later
  section is not charged to it.
- `proposal-slice-completeness` asks `git check-ignore` about
  repository-relative paths only. One newly visible absolute path (`/x`)
  made git refuse the whole batch, and the ignored-file check then
  reported nothing for any proposal.
- The lint's baseline takes the findings that were already there in done
  proposals and are now visible (847 accepted, up from the previous
  count). Done proposals are frozen, so they cannot be amended.

## non-goals

None.

## architecture

- `plugins/proposals/src/lib/proposals/expand-declared-files.ts`,
  `services/proposal-completeness.ts`, `swarm/proposal-slice-plan.ts`.

## Slices

- global_gate: none

### S1 — One reader for a slice's files

- **Status**: review
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/services/proposal-completeness.spec.ts tools/scripts/lint/proposal-slice-completeness.script.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/proposals/expand-declared-files.ts`
  - `plugins/proposals/src/lib/services/proposal-completeness.ts`
  - `plugins/proposals/src/lib/swarm/proposal-slice-plan.ts`
  - `plugins/proposals/tests/src/lib/services/proposal-completeness.spec.ts`
  - `tools/scripts/lint/proposal-slice-completeness.script.ts`
  - `tools/scripts/lint/proposal-slice-completeness.script.spec.ts`
  - `tools/scripts/lint/proposal-slice-completeness.baseline.json`
- shipped-in: `0153237b81f8`

## dependency graph

None.

## acceptance

- A slice whose `Files` field is a list of sub-bullets reports those
  files from `collectSliceStatuses`.
- A `Files` line after the last slice's section is not charged to it.
- Across every proposal in the repository, no slice reads files in the
  slice plan and none in the guard, except placeholders that are not paths.
- A declared absolute path does not blind the ignored-file check.
