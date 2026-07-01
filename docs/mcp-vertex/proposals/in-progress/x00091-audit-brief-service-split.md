---
id: x00091
status: in-progress
type: proposal
track: refactor
kind: fix
date: 2026-07-01
shipped-in: [67bf02ff]
recan: []
related:
    - a00048 # the audit that produced this proposal
title: "Refactor: split audit-brief.service.ts into severity-table + brief-modes + brief-builder services"
---

# x00091 — split `audit-brief.service.ts` into focused services

## goal

`plugins/audit/src/lib/services/audit-brief.service.ts` had grown past a single
responsibility: it owned the severity rubric table, the mode inference and
monorepo-badge legend, and the brief/reading-phase composition all at once.
This proposal splits it into three focused services under
`plugins/audit/src/lib/services/brief/` (severity table, brief modes, brief
builder) behind a thin barrel, so each concern is testable and bounded (≤ 200
LOC) without changing the public surface.

## why

The `audit_plan`/`audit_run` mode + canonical-severity work (general / specific
/ monorepo modes and the English `FATAL…EXEMPLARY` band tokens) pushed
`audit-brief.service.ts` well over a comfortable size and mixed three distinct
responsibilities in one file. Splitting them:

- isolates the severity rubric (data + render) from the mode legend and from
  the brief composition, so a change to one band or one mode no longer risks
  the others (SRP);
- keeps the barrel (`audit-brief.service.ts`) as the only public import point,
  so existing consumers keep compiling unchanged (OCP);
- makes the follow-on `audit-run.tool.ts` prelude extraction (s2) a small,
  reviewable step instead of another edit to a 600-LOC file.

## non-goals

- No change to the public surface of the audit plugin: `buildBrief`,
  `AuditMode`, `AuditScope`, `IBriefOptions` stay exported from the barrel.
- No new tool, no new namespace, no config change — this is an internal split.
- Does not revisit the severity-token canonicalization itself (that landed with
  the feat); it only relocates the rubric render into its own service.
- Does not touch `proposal-scaffolder.service.ts` (already extracted).

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
    - Each new file ≤ 200 LOC.
    - `bun run validate` stays green; all 61 audit plugin tests pass.
    - No new public method exposed; the split is purely internal.

### S2 — Tool split: `audit-run.tool.ts`

- **Status**: pending
- **Files**:
    - `plugins/audit/src/lib/tools/audit-run.tool.ts`
- **Gate**: `bun run validate`
- **Acceptance**:
    - Extract the (mode/scope/projects inference + path validation + mkdir) prelude into `plugins/audit/src/lib/services/run-pipeline-prelude.service.ts` and have `buildRunRegistration` call it.
    - `audit-run.tool.ts` ends up ≤ 350 LOC (currently > 600).
    - The proposal-scaffolder step is already extracted (`proposal-scaffolder.service.ts`); the prelude extraction should not touch that.
    - All existing audit-run e2e tests still pass.

### S3 — Cache-line awareness for Copilot host hint

- **Status**: pending
- **Files**:
    - `docs/mcp-vertex/host-hints/copilot-instructions.generated.md`
- **Gate**: `bun run lint:host-hints` and byte size < 800
- **Acceptance**:
    - Move the "Audit modes" block from the static Copilot host hint into a knowledge entry that the audit plugin loads on demand (lazy).
    - The regenerated host hint is ≤ 800 B without losing the host-level bootstrap information (what `mcp-vertex_overview` does, the bootstrap pointer to `docs/mcp-vertex/AGENT-BOOTSTRAP.md`, the close-marker rule).

## acceptance

- `bun run validate` is green (exit 0) at every slice boundary.
- The audit plugin public surface is unchanged; all existing audit tests pass.
- `audit-brief.service.ts` is a thin barrel; the three `brief/` services are each ≤ 200 LOC and own one concern.
