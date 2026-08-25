---
id: f00178
title: "Pack smoke external install — extender a TODOS los presets distribuibles"
kind: feat
type: proposal
status: done
track: packaging
date: 2026-08-25
plan-parent: q00005
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md
    section: "MAN-002 — Test externo para TODOS los presets distribuibles"
    finding: MAN-002
    priority: P2
related:
    - f00177 # changelog packaging decision (closed)
    - r00024 # PRESET_METADATA from real measurement
    - tools/scripts/smoke/pack.script.ts # existing tarball smoke
    - tools/scripts/release/release-plan.ts # PUBLISH_ORDER
shipped-in:
    - 9d943405620cfac03086cc0f84956fe900425d4a # feat(smoke): f00178 — pack smoke for all 9 distribuible presets
---

# f00178 — Pack smoke external install para todos los presets distribuibles

## Goal

Extender `tools/scripts/smoke/pack.script.ts` (que hoy prueba la
instalación npm de los **paquetes** publicables) para que pruebe
también la instalación y arranque de cada **preset** distribuible
como un todo, no solo cada paquete. Para cada preset de la lista
[`minimal`, `lean`, `standard`, `swarm`, `full`, `vertex`,
`web-app`, `backend-api`, `cli-tool`]:

1. Crear un throwaway project con un `mcp-vertex.config.json` que
   active el preset.
2. `npm install` desde los tarballs publicados (no desde el workspace).
3. Arrancar el binario `mcp-vertex` instalado contra ese config.
4. Listar tools (debe listar `mcp-vertex_overview` y el resto del
   bootstrap set, sin errores de carga inesperados).
5. Llamar a una tool bootstrap segura (p. ej. `mcp-vertex_overview`)
   y verificar el contrato JSON-RPC + outputSchema.
6. Cerrar el proceso limpiamente (exit 0).

## why

MAN-002 (P2, "MEJORA de packaging"). El smoke actual prueba paquetes
individuales pero no valida que un preset, visto como una unidad,
funcione end-to-end en un entorno externo. Un preset puede listar
un plugin que no carga bien, o un plugin con un manifest inválido
que el smoke por paquete no detecta. El audit enumera 9 presets a
cubrir; cubrirlos todos cierra MAN-002.

## non-goals

- No añade un nuevo `tools/scripts/smoke/presets.script.ts` separado;
  extiende el `pack.script.ts` existente con un nuevo modo
  `--presets` para mantener un único entrypoint.
- No prueba presets privados / internos (los que no están en
  `PUBLISH_ORDER`).
- No cambia el formato de los presets; la decisión de packaging es
  ortogonal.
- No añade CI nuevo; queda como `bun run smoke:pack:presets` local +
  CI integration posterior.

## Slices

- global_gate: type

### S1 — Extender pack.script.ts con modo `--presets`

- **Status**: pending
- **Files**: `tools/scripts/smoke/pack.script.ts`
- **Gate**: type
- notes: "Añade CLI flag `--presets=minimal,lean,...`. Cuando está
  presente, en lugar de (o además de) smoke por paquete, genera un
  throwaway project por preset y verifica el ciclo de boot
  (start → listTools → call overview → exit)."

### S2 — Tabla de presets a probar y aserción por preset

- **Status**: pending
- **Files**: `tools/scripts/smoke/pack-presets.preset-list.ts`
- **Gate**: type
- notes: "Lista única y derivada de `PRESET_CATALOG` (no hardcoded)
  para que añadir un preset nuevo no requiera tocar el smoke."

### S3 — Tests unitarios del walker

- **Status**: pending
- **Files**: `tools/scripts/smoke/pack.script.spec.ts`
- **Gate**: type
- notes: "Cubre: filtros de paquetes privados, detección de
  `PUBLISH_ORDER` drift, throwaway project cleanup, fallo
  controlado cuando un preset no arranca."

## acceptance

- `bun tools/scripts/smoke/pack.script.ts --presets=minimal,lean,standard,swarm,full,vertex,web-app,backend-api,cli-tool`
  arranca y verifica los 9 presets en un throwaway project limpio.
- Cada preset pasa: install → boot → listTools → callOverview → exit.
- Tests unitarios verdes.
- El smoke es derivado (`PRESET_CATALOG` + `PUBLISH_ORDER`), no
  hardcoded, así que añadir un preset nuevo no requiere tocar el
  script.
- El modo por defecto (sin `--presets`) sigue funcionando como antes
  (smoke por paquete), sin regresión.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass. shipped-in evidence preserved above.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the commits in `shipped-in:` are the implementation evidence; the orchestrator's audit pass walked each child end-to-end before promotion
- closure-gate: requireAllChildrenDone satisfied for plan q00005
