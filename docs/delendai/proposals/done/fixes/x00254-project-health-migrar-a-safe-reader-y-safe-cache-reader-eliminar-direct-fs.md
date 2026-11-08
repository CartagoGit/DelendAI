---
id: x00254
title: "\"project-health-migrar-a-safe-reader-y-safe-cache-reader-eliminar-direct-fs\""
kind: fix
status: done
type: proposal
track: filesystem
date: 2026-08-25
parent-plan: q00005
---

# x00254 — project-health migra a SafeWorkspaceReader

## Goal

Eliminar las lecturas directas de filesystem en `project-health` y hacer que sus señales baratas de lockfiles, configs y muestras de archivos pasen por `SafeWorkspaceReader`.

## why

`project-health` seguía siendo una excepción del lint de safe-reader. Eso dejaba una invariante de containment solo “documentada”, no aplicada por arquitectura, justo en un plugin que explora paths del workspace.

## non-goals

- No añade un scanner pesado nuevo ni cambia el contrato del tool.
- No introduce una primitive separada de cache porque el acceso necesario ya queda cubierto por `SafeWorkspaceReader`.

## Slices

- global_gate: none

### S1 — Migrar señales baratas al reader seguro
- **Status**: done
- **Files**: `plugins/project-health/src/lib/services/project-health-signals.service.ts`
- **Gate**: none

## acceptance

- `project-health-signals.service.ts` no importa `readFile`, `readdir` ni `stat` desde `node:fs/promises`.
- Lockfiles, configs, listados y marker samples se leen vía `SafeWorkspaceReader`.
- La spec focalizada del tool `project-health` sigue verde tras la migración.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the implementation pre-exists the q00005 migration and is verifiable via `git log --grep=x00254` against the merged work
- closure-gate: requireAllChildrenDone satisfied for plan q00005
