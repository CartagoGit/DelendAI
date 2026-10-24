---
id: f00164
title: "permisos: modelo por plugin/tool, visibilidad al activar y penalización de riesgo"
kind: feat
status: done
type: proposal
track: permissions
date: 2026-08-24
shipped-in:
  - ec7d4935 # chore(proposals): f00164 → review
  - 4eb9909d # feat(f00164): modelo de permisos por plugin/tool con visibilidad y scoring de riesgo
---

# f00164 — permisos: modelo por plugin/tool, visibilidad al activar y penalización de riesgo

## Goal

Definir un modelo de permisos por plugin y por tool, mostrarlo al activar y hacer que el auto-selector penalice el riesgo innecesario.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §22 PERM-001 — declarar permisos por plugin (filesystem-read/write, process, network, git-read/write, forge-read/write, env-read, secrets, browser, container, database)
- §22 PERM-002 — permisos por tool (mejor que solo por plugin)
- §22 PERM-003 — mostrar el coste de permisos al activar
- §22 PERM-004 — el auto-selector penaliza riesgo innecesario (preferir el plugin de menos permisos)

Los permisos se integran con el manifest (propuesta de manifests) y se muestran al usuario en el flujo de activación. El scoring del auto-selector resta `permissionRisk` cuando dos plugins resuelven la misma tarea.

## why

Un modelo de permisos declarativo es la base de la adopción empresarial: el usuario debe ver qué capacidades (red, procesos, escritura) habilita antes de activar un plugin, y el auto-selector debe preferir la opción de menor riesgo.

## non-goals

- No implementar un sandbox de runtime (esto es declaración + visibilidad + scoring).
- No bloquear la ejecución por permisos en esta propuesta.
- No duplicar el catálogo de permisos en múltiples sitios (vive en el manifest).

## Slices

- global_gate: type

### S1 — Schema de permisos por plugin/tool
- **Status**: done
- **Files**: `packages/core/src/lib/manifest/permissions.schema.ts`
- **Gate**: type
- acceptance:
  - "Define las 13 categorías de permisos (PERM-001)."
  - "Soporta granularidad por tool, no solo por plugin (PERM-002)."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Coste de permisos visible al activar
- **Status**: done
- **Files**: `packages/core/src/lib/tools/configuration-center.tool.ts`
- **Gate**: type
- acceptance:
  - "Al activar un plugin se muestra qué permisos requiere (p. ej. container -> process + Docker socket) (PERM-003)."

### S3 — Auto-selector penaliza riesgo innecesario
- **Status**: done
- **Files**: `plugins/auto-plugin-selector/src/lib/score/recommend-plugins.ts`
- **Gate**: type
- acceptance:
  - "El score resta permissionRisk; entre dos plugins equivalentes se prefiere el de menos permisos (PERM-004)."

## acceptance

- Define las 13 categorías de permisos (PERM-001).
- Soporta granularidad por tool, no solo por plugin (PERM-002).
- Al activar un plugin se muestra qué permisos requiere (p. ej. container -> process + Docker socket) (PERM-003).
- El score resta permissionRisk; entre dos plugins equivalentes se prefiere el de menos permisos (PERM-004).
