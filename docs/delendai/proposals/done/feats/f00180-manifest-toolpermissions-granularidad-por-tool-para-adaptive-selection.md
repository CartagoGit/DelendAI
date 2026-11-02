---
id: f00180
title: "Manifest `toolPermissions` — granularidad por tool para adaptive selection"
kind: feat
type: proposal
status: done
track: packaging
date: 2026-08-25
plan-parent: q00005
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md
    section: "MAN-004 — `toolPermissions` casi vacío"
    finding: MAN-004
    priority: P3
related:
    - r00025 # auto-plugin-selector scoring
    - f00179 # tokenBudget
shipped-in:
    - fc96136290b8129545f29a09e2f298207a0c2103 # feat(manifest): f00180 — toolPermissions per-tool granularity
---

# f00180 — Manifest `toolPermissions` per-tool

## Goal

Migrar `toolPermissions` del manifest de un array global por plugin
a un mapa **`toolId → permission/effect set`**. La estructura:

```ts
toolPermissions: {
    'git.readFile': ['fs:read'],
    'git.writeFile': ['fs:write'],
    'git.exec': ['process:exec'],
    'memory.save': ['fs:write', 'memory:write'],
    // ...
}
```

`auto-plugin-selector` y el host al evaluar permisos consultan el
permission set **de cada tool** que van a activar, no el del plugin
completo. Así, un plugin con una sola tool de alto riesgo no penaliza
a todas las demás.

## why

MAN-004 (P3, "MEJORA"). Hoy `toolPermissions` está casi vacío o
declarado como un único array para todo el plugin. Adaptive
selection no puede afinar — o activas el plugin entero con sus
permisos, o no lo activas. Rellenar progresivamente la tabla por
tool habilita scoring mucho más preciso.

## non-goals

- No convierte permisos en strings tipados (sigue siendo `string[]`
  con un set cerrado de efectos).
- No cambia la decisión de "qué tools se exponen en adaptive
  surface"; solo cambia el permission-set que se reporta.
- No migra TODOS los plugins de golpe; la aceptación es un set
  inicial de 6 plugins de alto riesgo.

## Slices

- global_gate: type

### S1 — Tipo `IPluginToolPermissions` en core public

- **Status**: pending
- **Files**: `packages/core/src/lib/contracts/plugin-manifest.types.ts`
- **Gate**: type
- notes: "Tipo `Record<string, readonly string[]>`. Backwards
  compat: `permissions: string[]` sigue siendo válido (interpretado
  como el set para TODAS las tools del plugin)."

### S2 — Migrar los 6 plugins de alto riesgo

- **Status**: pending
- **Files**: `plugins/{git,forge,issues,proposals,error-reporting,container}/plugin.manifest.ts`
- **Gate**: type
- notes: "Cada tool de cada plugin declara su permission set real."

### S3 — Actualizar el selector para consumir la tabla

- **Status**: pending
- **Files**: `plugins/auto-plugin-selector/src/lib/score/permission-risk.ts`
- **Gate**: type
- notes: "Cuando el manifest tiene la tabla, el risk score usa el
  set por tool; cuando no, aplica la heurística anterior."

## acceptance

- `IPluginToolPermissions` exportado desde `@mcp-vertex/core/public`.
- 6 plugins de alto riesgo migrados con tablas reales (al menos
  3 tools por plugin).
- `permission-risk` score actualizado y testeado.
- Backwards compat: plugins legacy siguen funcionando.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass. shipped-in evidence preserved above.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the commits in `shipped-in:` are the implementation evidence; the orchestrator's audit pass walked each child end-to-end before promotion
- closure-gate: requireAllChildrenDone satisfied for plan q00005
