---
id: x00091
status: ready
type: proposal
track: refactor
date: 2026-07-01
related:
    - a00048 # the audit that produced this proposal
title: "Refactor: split audit-brief.service.ts into severity-table + brief-modes + brief-builder services"
---

### s1 — Service split: `audit-brief.service.ts`

- **Status**: pending
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

### s2 — Tool split: `audit-run.tool.ts`

- **Status**: pending
- **Files**:
    - `plugins/audit/src/lib/tools/audit-run.tool.ts`
- **Gate**: `bun run validate`
- **Acceptance**:
    - Extract the (mode/scope/projects inference + path validation + mkdir) prelude into `plugins/audit/src/lib/services/run-pipeline-prelude.service.ts` and have `buildRunRegistration` call it.
    - `audit-run.tool.ts` ends up ≤ 350 LOC (currently > 600).
    - The proposal-scaffolder step is already extracted (`proposal-scaffolder.service.ts`); the prelude extraction should not touch that.
    - All existing audit-run e2e tests still pass.

### s3 — Cache-line awareness for Copilot host hint

- **Status**: pending
- **Files**:
    - `docs/mcp-vertex/host-hints/copilot-instructions.generated.md`
- **Gate**: `bun run lint:host-hints` and byte size < 800
- **Acceptance**:
    - Move the "Audit modes" block from the static Copilot host hint into a knowledge entry that the audit plugin loads on demand (lazy).
    - The regenerated host hint is ≤ 800 B without losing the host-level bootstrap information (what `mcp-vertex_overview` does, the bootstrap pointer to `docs/mcp-vertex/AGENT-BOOTSTRAP.md`, the close-marker rule).
