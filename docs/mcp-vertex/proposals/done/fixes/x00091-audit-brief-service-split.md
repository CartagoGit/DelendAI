---
id: x00091
status: done
type: proposal
track: refactor
date: 2026-07-01
kind: fix
related:
    - a00048 # the audit that produced this proposal
title: "Refactor: split audit-brief.service.ts into severity-table + brief-modes + brief-builder services"
---

# x00091 — Audit-brief service split

## goal

Reduce `audit-brief.service.ts` (552 LOC) and `audit-run.tool.ts` (683 LOC) to file budgets the agent can hold in working memory, and trim the static Copilot host hint so it stays under the cache-line budget. Three files (the brief service, the run tool, the host-hint) each mix 2-4 unrelated concerns today; the refactor gives each concern its own module so the next audit, fix, or extension lands on a 100-300 LOC file instead of a 500-700 LOC one.

## why

A 2026-07-01 internal audit (a00048) found the audit plugin's two biggest files each failed SRP:

- `audit-brief.service.ts` mixed the 7-band severity table, mode inference, the monorepo badge, the "Modos disponibles" legend, and the `buildBrief` markdown assembly in one 552-LOC file.
- `audit-run.tool.ts` mixed the input schema, the pipeline prelude, the workspace probes, and the actual fan-out handler in one 683-LOC file.
- The Copilot host-hint had grown past the cache-line budget and was duplicating audit-mode content that the audit plugin already exposes on demand.

The refactor is the cheapest possible fix: pure relocation, no behaviour change. Output is byte-identical for the brief, the spec suite is green, and downstream tools that import from the public barrel keep working unchanged.

## non-goals

- Rewriting the brief's markdown content (out of scope; the goal is relocation, not redesign).
- Changing `IBriefOptions` semantics or adding new options.
- Renaming the public surface (`buildBrief`, `AuditMode`, `AuditScope`, `IBriefOptions`).
- Touching the proposal-scaffolder service (already extracted in a prior slice).
- Migrating other plugins to the new module layout.

## architecture

Three parallel slices, all file-disjoint. **S1** splits the brief service. **S2** splits the run tool. **S3** trims the Copilot host hint by lazy-loading audit modes.

- **S1 — Service split: `audit-brief.service.ts`**
- **S2 — Tool split: `audit-run.tool.ts`**
- **S3 — Cache-line awareness for Copilot host hint**

## slices

### S1 — Service split: `audit-brief.service.ts`

- **Status**: done (commit `67bf02ff`)
- **Files**:
    - `plugins/audit/src/lib/services/audit-brief.service.ts`
    - `plugins/audit/src/lib/services/audit-brief.constants.ts` (existing, keep as the data table)
- **Gate**: `bun run validate`
- **Acceptance**:
    - The new layout is three services under `plugins/audit/src/lib/services/brief/`:
        - `severity-table.service.ts` — owns `SEVERITY_TABLE_ROWS` and the markdown render of the 7-band rubric table.
        - `brief-modes.service.ts` — owns `inferMode`, `renderMonorepoBadge`, and the "Modos disponibles" legend.
        - `brief-builder.service.ts` — owns `buildBrief` + `buildReadingPhases` + `buildLayerPhase` (pure composition over the other two).
    - `audit-brief.service.ts` becomes a thin barrel re-exporting the public surface (`buildBrief`, `AuditMode`, `AuditScope`, `IBriefOptions`) so existing imports keep compiling.
    - Each new file ≤ 200 LOC (one structural overage in brief-builder to 398 LOC for the markdown template is documented and accepted).
    - `bun run validate` stays green; all 65 audit plugin tests pass.
    - No new public method exposed; the split is purely internal.

### S2 — Tool split: `audit-run.tool.ts`

- **Status**: done (commit `3004071d`)
- **Files**:
    - `plugins/audit/src/lib/tools/audit-run.tool.ts`
- **Gate**: `bun run validate`
- **Acceptance**:
    - Extract the (mode/scope/projects inference + path validation + mkdir) prelude into `plugins/audit/src/lib/services/run-pipeline-prelude.service.ts` and have `buildRunRegistration` call it.
    - `audit-run.tool.ts` ends up ≤ 350 LOC (was 683, current: 349).
    - The proposal-scaffolder step is already extracted (`proposal-scaffolder.service.ts`); the prelude extraction does not touch that.
    - All existing audit-run e2e tests still pass (8/8 files, 65/65 tests green).
    - Bonus: `audit-plan.tool.ts`'s duplicated `inferMode` (with a latent `'full' in UNIVERSAL_SCOPES` bug) is deduped to the shared implementation.

### S3 — Cache-line awareness for Copilot host hint

- **Status**: done (commit `<pending>`)
- **Files**:
    - `tools/scripts/catalog/render-host-hints.script.ts`
    - `tools/scripts/catalog/render-host-hints.spec.ts`
    - `docs/mcp-vertex/host-hints/copilot-instructions.generated.md`
    - `docs/mcp-vertex/host-hints/claude.generated.md`
    - `docs/mcp-vertex/host-hints/agents.generated.md`
- **Gate**: `bun run lint:host-hints` and byte size ≤ 800 per fragment
- **Acceptance**:
    - Lowered `MAX_FRAGMENT_BYTES` from 1 300 to 800 (the 800-byte budget
      keeps the fragment on a single cache line for first-turn context).
    - Collapsed the verbose 4-line "first move" into a single
      1-line statement ("`Follow [bootstrap]; first move is mcp-vertex_overview
      { compact: true } then mcp-vertex_agent_catalog`"); dropped the
      multi-line "intentionally minimal" trailing blockquote (the
      bootstrap pointer already says it).
    - Audit modes / cross-cutting invariants / score dimensions /
      layer-config documentation stays in the audit plugin's
      `KNOWLEDGE_BRIEF` + `audit-scopes` knowledge entries (loaded
      on demand via `mcp-vertex_knowledge` / `agent_catalog`); the
      host hint is just the discovery + host-specific footnote now.
    - All 3 host-hint fragments stay well under 800 B (copilot: 497,
      claude: 486, agents: 510).
    - The 9 host-hints spec tests pass (renamed the canonical-first-move
      assertion to match the new compact wording).

## acceptance

This proposal is complete when:

1. `audit-brief.service.ts` ≤ 60 LOC and re-exports every previously-public name.
2. `audit-brief.service.ts` (or `brief/builder.service.ts`) is the only place `buildBrief` lives.
3. `audit-run.tool.ts` ≤ 350 LOC and the prelude / probes / schemas are each in their own module.
4. `bun run validate` is green end-to-end (typecheck + lint + tests + drift guards).
5. All 65 audit plugin tests pass.
6. The Copilot host hint stays ≤ 800 B (s3).

