---
id: f00171
title: "dogfooding: pipeline local incidente→propuesta (incidentes de logs + clasificación → borradores deduplicados)"
kind: feat
status: done
type: proposal
track: dogfooding
date: 2026-08-24
shipped-in:
  - f8c0123e # chore(proposals): corregir Files de f00171
  - b35cd1ba # chore(proposals): f00171 → review
  - 411e5681 # feat(f00171): pipeline incidente→propuesta local en proposals
---

# f00171 — dogfooding: pipeline local incidente→propuesta (incidentes de logs + clasificación → borradores deduplicados)

## Goal

Cerrar el bucle dogfooding "Vertex usa Vertex" por un camino local sin dependencia de GitHub: convertir los incidentes agrupados de logs (logIncidents, ya agrupa por toolName + hash del mensaje de error) y la clasificación estricta por evidencia positiva (x00215) en borradores de propuestas locales, deduplicados por firma contra las propuestas existentes. Así un agente puede decir "analiza los incidentes internos y créame propuestas por cada uno" sin red ni repo remoto.

## why

f00158 lleva los errores a GitHub issues y su triage genera propuestas desde ahí; pero el camino local (log → propuesta) sin red es la pieza que falta para el dogfooding directo y para proyectos sin repo remoto. Reutiliza logIncidents (ya agrupa fallos por tool + hash) y la taxonomía de x00215, añadiendo solo el puente hacia el plugin proposals.

## non-goals

- No reemplazar error-reporting/issues-triage (f00158): complementarlos con el camino local sin GitHub.
- No auto-aplicar ni auto-implementar (eso es f00172).
- No crear propuestas duplicadas: dedupe por firma de incidente contra propuestas existentes.
- No exponer datos privados del proyecto: el borrador se construye desde el cluster redactado (same-verbosity), nunca desde args/result reales.

## Slices

- global_gate: type

### S1 — Contrato incidente→propuesta (DTO + taxonomía de clasificación)
- **Status**: done
- **Files**: `plugins/proposals/src/lib/contracts/interfaces/incident-proposal.interface.ts`, `plugins/proposals/src/lib/contracts/constants/incident-taxonomy.constant.ts`
- **Gate**: type
- acceptance:
  - "DTO de borrador incidente→propuesta con firma estable (toolName + hash de error redactado)."
  - "Taxonomía de clasificación BUG/REGRESSION/SECURITY/PRIVACY/PERFORMANCE/TOKEN_REGRESSION/DOC_DRIFT/CONFIG_DRIFT/DUPLICATE/NOT_A_BUG/DESIGN_DECISION/PRODUCT_DECISION/NEEDS_REPRODUCTION/UNKNOWN como constantes tipadas (reutilizando la evidencia positiva de x00215)."
  - "Sin dependencias de fs ni red: puro y testeable."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Generador de borradores con dedupe por firma
- **Status**: done
- **Files**: `plugins/proposals/src/lib/services/incident-proposal.service.ts`
- **Gate**: type
- acceptance:
  - "incidentProposalService consume el cluster de logIncidents y devuelve borradores clasificados."
  - "Deduplica por firma contra propuestas existentes (id/título/signature) y contra incidentes ya convertidos."
  - "El borrador se genera desde el cluster redactado, nunca desde args/result reales."

### S3 — Tool incidente→propuesta + wiring en el plugin proposals
- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/incident-proposal.tool.ts`, `plugins/proposals/src/index.ts`
- **Gate**: type
- acceptance:
  - "Tool registrada que lista incidentes convertibles y genera borradores de propuesta; no escribe sin write:true."
  - "Respeta el outputSchema tipado del plugin y el contrato de toolOk/toolError."
  - "Cubierta por tests unitarios con fixtures de log-store."

## acceptance

- DTO de borrador incidente→propuesta con firma estable (toolName + hash de error redactado).
- Taxonomía de clasificación BUG/REGRESSION/SECURITY/PRIVACY/PERFORMANCE/TOKEN_REGRESSION/DOC_DRIFT/CONFIG_DRIFT/DUPLICATE/NOT_A_BUG/DESIGN_DECISION/PRODUCT_DECISION/NEEDS_REPRODUCTION/UNKNOWN como constantes tipadas (reutilizando la evidencia positiva de x00215).
- Sin dependencias de fs ni red: puro y testeable.
- incidentProposalService consume el cluster de logIncidents y devuelve borradores clasificados.
- Deduplica por firma contra propuestas existentes (id/título/signature) y contra incidentes ya convertidos.
- El borrador se genera desde el cluster redactado, nunca desde args/result reales.
- Tool registrada que lista incidentes convertibles y genera borradores de propuesta; no escribe sin write:true.
- Respeta el outputSchema tipado del plugin y el contrato de toolOk/toolError.
- Cubierta por tests unitarios con fixtures de log-store.
