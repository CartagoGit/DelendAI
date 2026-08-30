---
id: x00306
title: "Raw error message prohibido."
kind: fix
status: ready
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#raw-error-message-prohibido
---

# x00306 — Raw error message prohibido.

## Goal

Migrated work item: Raw error message prohibido..

## Slices

### S1 — Sanitizar errores en las superficies públicas de logs
- files: [plugins/logs/src/lib/services/log-search-incidents.ts, plugins/logs/src/lib/tools/tools.ts, plugins/logs/tests/incidents-search.spec.ts, plugins/logs/tests/tools.spec.ts, plugins/logs/tests/index.spec.ts]
- gate: type
- status: pending
- acceptance:
  - logs_query, logs_tail, logs_errors_tail, logs_search e incidents no exponen error.message ni error.stack, tampoco con full/includeMeta.
  - La respuesta conserva alternativas operativas seguras: summary, toolName, incidentType, fingerprint, hasStack y conteos cuando correspondan.
  - El almacenamiento local JSONL puede conservar el diagnóstico completo sin devolverlo por MCP.
  - Los tests focalizados verifican ausencia del texto crudo y presencia de la alternativa segura.
- review-state: in_review
- review-implementer: implementation_runner
## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#raw-error-message-prohibido` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.
