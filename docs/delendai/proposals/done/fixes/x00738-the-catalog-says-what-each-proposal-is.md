---
id: x00738
title: "The catalog says what each proposal is"
kind: fix
status: done
type: proposal
track: hosts
date: 2026-09-28
priority: P2
related: []
last-transition-id: 6536f9ea-37cd-4620-a6ce-0fd2ad98daad
last-correlation-id: 6536f9ea-37cd-4620-a6ce-0fd2ad98daad
last-transition-from: review
shipped-in:
  - "327a687d2"
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

- **Status**: done
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
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Independiente: implementer claude-opus-5-5, reviewer minimax-3. Verifiqué 327a687d2 (Merge PR #606 — x00738: the catalog says what each proposal is). El candidato dado (b5e425222a) es docs commit; el delivering real es 327a687d2. global_gate: none. Slice: catalog deriva de proposals que existen, no de índice stale. Aceptación cumplida. Sin cambios out-of-scope. NOTA: aprobación previa de Cartago en g2 (commit ecbe59a94 'docs(proposals): x00738 to done').
- review-attribution: claude-opus-5-5 from commit 327a687d2d25 names refs/heads/delendai/wip/claude-opus-5-5/implement/x00738-all-g1/the-catalog-says-what-each-proposal-is (327a687d2d2538859f18142b770e107c29cc765d), opened by minimax-3
## dependency graph

None.

## acceptance

- f00538 in the catalog: its title, `Forward-sync the release branch back
  into the integration branch after every promotion`, and date `2026-09-15`.
- No actionable proposal in the catalog has an empty date or its id as title.
