---
id: x00912
title: "Every tool page is translated from the English its tool registers"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-18
last-transition-id: 128fa125-b488-4e2c-a826-a1840dc1a15f
last-correlation-id: 128fa125-b488-4e2c-a826-a1840dc1a15f
last-transition-from: ready
last-transition-at: 2026-10-18T04:21:42.084Z
---

# x00912 — Every tool page is translated from the English its tool registers

## goal

Every tool page on the site shows, in each of its twelve languages, the description the tool registers in its code. When this is done the stale-translation baseline of `gen-capabilities` is empty and gone, and `--strict` fails on any tool whose translations were made from an English other than its registration's.

## why

x00910 S2 made a tool's registration the single source of its long description: the site's English is read from it, and the i18n catalogue's `en` (under `apps/web/src/i18n/tools/`) records the English its translations were made from. Measured 2026-10-18, 56 tools have translations made from an English their code no longer registers, so in eleven languages their pages describe an older tool. They were recorded in `apps/web/scripts/stale-translations.baseline.json` so the check could fail on new drift without failing on old; this proposal pays that debt.

By plugin: proposals 15, external-mcps 7, orchestrator-runner 7, logs 4, memory 4, core 3, rules 3, audit 2, docs 2, usage-tracking 2, and one each for agent-orchestrator, analyze, deps, notification, plan, quality and search.

## non-goals

- Changing any tool's registered description: the code is the source; only the catalogue follows it.
- Translating tools that have no catalogue entry yet.

## slices

- global_gate: type

### S1 — The proposals tools

- **Status**: pending
- **Files**: `apps/web/src/i18n/tools/`
- **Gate**: type
- acceptance:
  - "The 15 proposals tools in the baseline carry, in their catalogue entry, `en` equal to their registration's description and eleven translations made from it; they leave the baseline, and `gen-capabilities --strict` passes."

### S2 — The orchestration tools

- **Status**: pending
- **Files**: `apps/web/src/i18n/tools/`
- **Gate**: type
- acceptance:
  - "The external-mcps (7), orchestrator-runner (7) and usage-tracking (2) tools in the baseline are translated from their registration's English and leave the baseline."

### S3 — The rest, and no baseline

- **Status**: pending
- **Files**:
  - `apps/web/src/i18n/tools/`
  - `apps/web/scripts/stale-translations.baseline.json`
  - `apps/web/scripts/gen-capabilities.ts`
- **Gate**: type
- acceptance:
  - "The remaining 25 tools are translated from their registration's English; the baseline file is deleted with the code that reads it, so `--strict` fails on any stale translation."

## acceptance

- Every tool page reads, in every language, the description its tool registers.
- No baseline excuses a stale translation.
