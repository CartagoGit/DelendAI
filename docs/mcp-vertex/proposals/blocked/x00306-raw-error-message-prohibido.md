---
id: x00306
title: "Raw error message prohibido."
kind: fix
status: blocked
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#raw-error-message-prohibido
---

# x00306 — Raw error message prohibido.

## Goal

Migrated work item: Raw error message prohibido..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Sanitizar errores en las superficies públicas de logs
- **Status**: pending
- **Files**: `plugins/logs/src/lib/services/log-search-incidents.ts`, `plugins/logs/src/lib/tools/tools.ts`, `plugins/logs/tests/incidents-search.spec.ts`, `plugins/logs/tests/tools.spec.ts`, `plugins/logs/tests/index.spec.ts`
- **Gate**: type
- files: [plugins/logs/src/lib/services/log-search-incidents.ts, plugins/logs/src/lib/tools/tools.ts, plugins/logs/tests/incidents-search.spec.ts, plugins/logs/tests/tools.spec.ts, plugins/logs/tests/index.spec.ts]
- gate: type
- status: pending
- acceptance:
  - logs_query, logs_tail, logs_errors_tail, logs_search e incidents no exponen error.message ni error.stack, tampoco con full/includeMeta.
  - La respuesta conserva alternativas operativas seguras: summary, toolName, incidentType, fingerprint, hasStack y conteos cuando correspondan.
  - El almacenamiento local JSONL puede conservar el diagnóstico completo sin devolverlo por MCP.
  - Los tests focalizados verifican ausencia del texto crudo y presencia de la alternativa segura.
- review-state: changes_requested
- review-implementer: implementation_runner
- review-reviewer: technical_investigator
- review-log: requested_changes by delivery_verifier — Focused review passed on claimed logs files: targeted vitest, Biome, and logs typecheck are green, and public MCP outputs in full/includeMeta stay redacted while exposing safe alternatives. Approval is blocked in this review pass because proposal_review approve requires explicit evidence.validateExitCode=0, and this scope intentionally ran focused logs validation rather than a full validate command.
- review-log: requested_changes by technical_investigator — El gate global sigue bloqueado por errores fuera del alcance de x00306-S1: bun run validate devuelve exit 1 durante typecheck en tools y otros archivos externos. La implementación de logs tiene validación focalizada verde. Alternativa: resolver esos blockers en propuestas separadas y volver a someter esta slice con evidencia validateExitCode=0.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#raw-error-message-prohibido` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.
