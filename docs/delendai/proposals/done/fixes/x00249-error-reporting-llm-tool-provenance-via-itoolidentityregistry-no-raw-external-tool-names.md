---
id: x00249
title: "error-reporting llm tool provenance via IToolIdentityRegistry, no raw external tool names"
kind: fix
status: done
type: proposal
track: privacy
date: 2026-08-25
parent-plan: q00005
---

# x00249 — provenance segura para llm-format en error-reporting

## Goal

Eliminar la heurística por sufijo en la clasificación de fallos llm-format para que error-reporting solo trate como internos los tools LLM de mcp-vertex probados por registry metadata.

## why

Un host podía registrar un tool externo cuyo nombre terminara en un sufijo interno y conseguir que el reporter construyera componentId y synthetic frames desde un nombre crudo potencialmente sensible.

## non-goals

- No cambia la política general del DTO público fuera de la ruta llm-format.
- No introduce nuevas heurísticas textuales para inferir provenance.

## Slices

- global_gate: type

### S1 — Registry-backed provenance for llm-format
- **Status**: done
- **Files**: `plugins/error-reporting/src/lib/origin-analyzer.helper.ts`, `plugins/error-reporting/src/lib/report-builder.helper.ts`, `plugins/error-reporting/src/index.ts`, `plugins/error-reporting/tests/origin-analyzer.spec.ts`, `plugins/error-reporting/tests/index.spec.ts`
- **Gate**: type

## acceptance

- Los fallos llm-format solo se clasifican como internos cuando el registry resuelve un `safeToolId` de mcp-vertex permitido.
- Un tool host con sufijo engañoso ya no genera reportes internos ni componentId derivados del nombre crudo.
- La suite de error-reporting permanece verde.
resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the implementation pre-exists the q00005 migration and is verifiable via `git log --grep=x00249` against the merged work
- closure-gate: requireAllChildrenDone satisfied for plan q00005
