---
id: x00255
title: "\"quality-policy-migrar-a-safe-reader-eliminar-direct-fs\""
kind: fix
status: done
type: proposal
track: filesystem
date: 2026-08-25
parent-plan: q00005
---

# x00255 — quality-policy migra a SafeWorkspaceReader

## Goal

Eliminar las lecturas directas de filesystem en `quality-policy` para `mcp-vertex.config.json`, el chain de `tsconfig` y el sampleo de rutas TypeScript.

## why

`quality-policy` era otra excepción permanente del lint de safe-reader. Eso dejaba una vía inconsistente de lectura de workspace en un plugin que justamente resume políticas y convenciones del proyecto.

## non-goals

- No cambia el contenido semántico de las áreas `tests`, `conventions`, `lint`, `types` o `coverage`.
- No reescribe `createWorkspaceFileReader`; solo sustituye el resolver inseguro del plugin por rutas contenidas.

## Slices

- global_gate: none

### S1 — Migrar lecturas de config y sampleo al reader seguro
- **Status**: done
- **Files**: `plugins/quality-policy/src/lib/services/quality-policy.service.ts`, `plugins/quality-policy/src/lib/services/quality-policy-types.service.ts`
- **Gate**: none

## acceptance

- `quality-policy.service.ts` y `quality-policy-types.service.ts` no importan `readFile`, `readdir` ni `stat` directos.
- Las lecturas de `mcp-vertex.config.json`, `tsconfig*.json` y el sampleo de roots pasan por `SafeWorkspaceReader`.
- La spec focalizada del tool `quality-policy` sigue verde tras la migración.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the implementation pre-exists the q00005 migration and is verifiable via `git log --grep=x00255` against the merged work
- closure-gate: requireAllChildrenDone satisfied for plan q00005
