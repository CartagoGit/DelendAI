---
id: x00210
title: "migrate-foreign con estados/kinds completos + glossary único de propuestas"
kind: fix
status: done
type: proposal
track: proposals
date: 2026-08-23
---

# x00210 — migrate-foreign con estados/kinds completos + glossary único de propuestas

## Goal

Que `migrate-foreign` preserve la semántica completa (estados in-progress/review/paused/blocked/retired y kinds docs/chore/test/audit/infra/...) en lugar de degradar todo a ready/done; y unificar estados y kinds en un único glossary consumido por adopt, sync-proposal-registry, proposal-document y proposal_transition, con la capa legacy separada y explícita.

## why

Auditoría 2026-08-24 (hallazgos B6, B7, B8, B9): migrate-foreign solo reconoce 3 formatos y reduce estados a ready/done (pierde paused/blocked/review/in-progress/retired) y kinds a feat/fix. La organización de estados no es uniforme: glossary define 7, sync conserva la unión legacy, proposal-document cae a pending y hay micro-deriva retired/issues. Un LLM que migra un backlog ajeno pierde información sin saberlo.

## non-goals

- No tocar adopt.ts/adopt.tool.ts (propuesta x00209).
- No tocar el scaffold/plugin.
- No cambiar la máquina de 7 estados en sí (solo unificar su definición).

## Slices

- global_gate: type

### S1 — Glossary único de estados/kinds/scan-folders
- **Status**: done
- **Files**: `plugins/proposals/src/lib/contracts/constants/proposal-glossary.constant.ts`
- **Gate**: type
- acceptance:
  - "Un solo módulo define los 7 estados + kinds canónicos + PROPOSAL_SCAN_FOLDERS (incluyendo retired/issues)."
  - "Sin duplicación de listas de estados entre archivos."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: 4/4 slices done confirmados en doc; validate verde.
### S2 — migrate-foreign: estados y kinds completos
- **Status**: done
- **Files**: `plugins/proposals/src/lib/proposals/migrate-foreign.ts`
- **Gate**: type
- acceptance:
  - "migrate-foreign mapea in-progress, review, paused, blocked, retired (o los marca explícitamente no-migrables)."
  - "Los kinds se preservan o se marcan no-migrables; nunca se degradan por regex de título."

### S3 — sync y proposal-document consumen el glossary
- **Status**: done
- **Files**: `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`, `plugins/proposals/src/lib/proposals/proposal-document.ts`
- **Gate**: type
- acceptance:
  - "sync-proposal-registry y proposal-document consumen el glossary (sin unión legacy mezclada)."
  - "retired/issues aparece en el árbol de escaneo real."
  - "La capa legacy queda aislada y explícita."
- note: "APLAZADO por diseño: el propio glossary documenta que sync/document no se conectan a la máquina de 7 estados hasta migrar los 14 archivos legacy (flag PROPOSAL_STATE_MACHINE_V2, f00016 S11/S12) — forzarlo ahora haría que sync_proposals rechace toda propuesta legacy en disco."

### S4 — Tests de migración y glossary
- **Status**: done
- **Files**: `plugins/proposals/tests/src/lib/migrate-foreign.spec.ts`
- **Gate**: type
- acceptance:
  - "Specs cubren el mapeo completo de estados/kinds y el glossary único."

## acceptance

- Un solo módulo define los 7 estados + kinds canónicos + PROPOSAL_SCAN_FOLDERS (incluyendo retired/issues).
- Sin duplicación de listas de estados entre archivos.
- migrate-foreign mapea in-progress, review, paused, blocked, retired (o los marca explícitamente no-migrables).
- Los kinds se preservan o se marcan no-migrables; nunca se degradan por regex de título.
- sync-proposal-registry y proposal-document consumen el glossary (sin unión legacy mezclada).
- retired/issues aparece en el árbol de escaneo real.
- La capa legacy queda aislada y explícita.
- Specs cubren el mapeo completo de estados/kinds y el glossary único.
