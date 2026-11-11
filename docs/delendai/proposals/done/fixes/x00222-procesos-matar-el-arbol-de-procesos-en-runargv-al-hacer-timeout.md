---
id: x00222
title: "procesos: matar el árbol de procesos en runArgv al hacer timeout"
kind: fix
status: done
type: proposal
track: concurrency
date: 2026-08-24
---

# x00222 — procesos: matar el árbol de procesos en runArgv al hacer timeout

## Goal

Alinear `runArgv` con el comportamiento de process-group del runner shell: al exceder timeout debe matar **todo el árbol de procesos**, no solo el proceso inmediato.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §6 PR-004 — matar árbol de procesos en `runArgv`
- §6 PR-005 — no usar shell si no es imprescindible (principio, argv-first por defecto)
- §28 CHECK-002 — validar si `runArgv` deja descendientes vivos en todos los SO

Hoy `runArgv` hace `child.kill('SIGKILL')` al proceso inmediato; si el binario creó hijos, pueden sobrevivir. Test: proceso padre que crea un hijo duradero y excede timeout → tras timeout no debe quedar ninguno vivo.

## why

Builds, Docker, package managers y test runners crean hijos. Dejarlos vivos tras un timeout consume recursos y produce efectos laterales fantasma. El runner shell ya lo hace bien; `runArgv` debe alinearse.

## non-goals

- No cambiar el default argv-first (PR-005 se mantiene como principio).
- No introducir shell para kill (se usa kill del process group).
- No reescribir el runner shell existente.

## Slices

- global_gate: type

### S1 — Matar el árbol de procesos en runArgv
- **Status**: done
- **Files**: `packages/core/src/lib/external-tool/run-external-tool.ts`
- **Gate**: type
- acceptance:
  - "Al timeout se mata el process group completo (padre + descendientes)."
  - "El mecanismo es portable (Unix process group; Windows taskkill si aplica)."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Test de descendientes vivos
- **Status**: done
- **Files**: `packages/core/tests/src/lib/shared/process-tree-kill.spec.ts`
- **Gate**: type
- acceptance:
  - "Padre crea hijo duradero y excede timeout -> no queda ningún proceso vivo."

## acceptance

- Al timeout se mata el process group completo (padre + descendientes).
- El mecanismo es portable (Unix process group; Windows taskkill si aplica).
- Padre crea hijo duradero y excede timeout -> no queda ningún proceso vivo.
