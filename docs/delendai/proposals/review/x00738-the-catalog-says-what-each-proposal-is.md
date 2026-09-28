---
id: x00738
title: "The catalog says what each proposal is"
kind: fix
status: review
type: proposal
track: hosts
date: 2026-09-28
priority: P2
related: []
last-transition-id: 709f4117-d404-4c1d-91d8-011c8ff5ce50
last-correlation-id: 709f4117-d404-4c1d-91d8-011c8ff5ce50
last-transition-from: in-progress
---

# x00738 — The catalog says what each proposal is

## goal

The agent catalog lists each actionable proposal with its real title and
date, as its file states them.

## why

The owner noticed every proposal in `agent-catalog.generated.json` had
`"date": ""`, and its title was its id (`"title": "f00538"`), for all 46
actionable proposals. Two causes:

- The proposal index never carried the title, so every reader of it fell
  back to the id.
- The catalog dropped the date in compact mode, which is the committed
  one, and the artifact then wrote `""` for it.

## why this design

- The index entry carries the frontmatter `title` (trimmed, after `id`);
  a proposal without one gets none.
- The catalog keeps a proposal's date in both modes, when it has one. It is
  a few bytes per proposal and says how old each is.
- The core boundary inventory's two rules for the catalog's clone signature
  become one, as the signature is now one line.

## non-goals

None.

## architecture

- `plugins/proposals/src/lib/proposals/registry-entry.helper.ts`,
  `contracts/interfaces/registry-entry.interface.ts`.
- `packages/core/src/lib/catalog/agent-discovery-catalog.ts`.

## Slices

- global_gate: none

### S1 — Title in the index, date in the catalog

- **Status**: review
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/proposals/registry-entry-title.spec.ts packages/core/tests/src/lib/catalog`
- **Files**:
  - `plugins/proposals/src/lib/proposals/registry-entry.helper.ts`
  - `plugins/proposals/src/lib/contracts/interfaces/registry-entry.interface.ts`
  - `plugins/proposals/tests/src/lib/proposals/registry-entry-title.spec.ts`
  - `packages/core/src/lib/catalog/agent-discovery-catalog.ts`
  - `packages/core/tests/src/lib/catalog/agent-discovery-catalog.spec.ts`
  - `tools/scripts/inspect/core-proposals-boundary.script.ts`
  - `docs/delendai/CORE-PROPOSALS-BOUNDARY-INVENTORY.md`
  - `docs/delendai/agent-catalog.generated.json`

## dependency graph

None.

## acceptance

- f00538 in the catalog: its title, `Forward-sync the release branch back
  into the integration branch after every promotion`, and date `2026-09-15`.
- No actionable proposal in the catalog has an empty date or its id as title.
