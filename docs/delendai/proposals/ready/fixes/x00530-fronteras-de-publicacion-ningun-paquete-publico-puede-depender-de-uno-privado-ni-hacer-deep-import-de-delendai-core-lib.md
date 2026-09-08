---
id: x00530
title: "Fronteras de publicacion: ningun paquete publico puede depender de uno privado ni hacer deep import de @delendai/core/lib"
kind: fix
status: ready
type: proposal
track: architecture
date: 2026-09-08
---

# x00530 — Fronteras de publicacion: ningun paquete publico puede depender de uno privado ni hacer deep import de @delendai/core/lib

## Goal

Dejar el conjunto PUBLISH_ORDER instalable desde npm en un proyecto limpio: cero dependencias hacia paquetes private:true y cero imports fuera de los subpaths declarados en exports.

## why

Auditoria 2026-09-08 sobre 6a5a9e5, tercera vez que se reporta sin resolver. (1) packages/core es publico y su package.json declara solo @delendai/contracts, pero importa @delendai/state en src/lib/cli/assemble.ts:43 (runtime) y en src/lib/plugins/plugin-contract.ts:26 (tipo IStateRegistry expuesto en el contrato PUBLICO de plugins); @delendai/state es private:true. (2) plugins/proposals es publico y declara en dependencies @delendai/state y @delendai/proposals-sqlite, ambos private:true: un npm install de @delendai/proposals no puede resolverlos. (3) packages/context-compiler depende de @delendai/state igual. (4) Hay 44 ocurrencias de import desde @delendai/core/lib/* en 20+ ficheros, incluido packages/core/src/public/index.ts, y core solo publica los subpaths ., ./public, ./cli, ./contracts, ./runtime, ./plugin, ./node. Existe un lint no-internal-core-imports pero su cobertura es parcial. El efecto combinado es que el snapshot no es publicable y que pack-smoke solo lo demuestra cuando llega a ejecutarse.

## non-goals

- No decidir en esta propuesta si @delendai/state pasa a publico o si su contrato migra a @delendai/contracts: S1 lo resuelve con datos, pero la decision se toma dentro de S1.
- No tocar los nombres publicos de las herramientas MCP.

## Slices

- global_gate: type

### S1 — IStateRegistry y el contrato de state salen a @delendai/contracts; core deja de importar @delendai/state en su superficie publica
- **Status**: pending
- **Files**: `packages/contracts/src/index.ts`, `packages/core/src/lib/plugins/plugin-contract.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/package.json`, `packages/state/src/index.ts`
- **Gate**: type
- acceptance:
  - "El tipo IStateRegistry y sus tipos asociados viven en @delendai/contracts y @delendai/state los reexporta para no romper consumidores internos."
  - "packages/core/src/lib/plugins/plugin-contract.ts no importa @delendai/state."
  - "Si core sigue necesitando una implementacion concreta en runtime, o bien @delendai/state pasa a publico y se declara en dependencies, o bien la implementacion in-memory se mueve a core; la propuesta documenta cual de las dos se eligio y por que."
  - "grep de @delendai/state en packages/core/src devuelve cero, o devuelve solo imports respaldados por una dependencia declarada y publica."

### S2 — plugins/proposals y packages/context-compiler dejan de depender de paquetes privados
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/package.json`, `packages/context-compiler/package.json`, `packages/proposals-sqlite/package.json`, `packages/state/package.json`
- **Gate**: type
- acceptance:
  - "Ningun paquete de PUBLISH_ORDER tiene en dependencies ni en peerDependencies un paquete @delendai/* con private:true."
  - "Los paquetes que pasan a publicos declaran files, exports, main y types coherentes y entran en PUBLISH_ORDER en su posicion topologica."
  - "Los que siguen privados dejan de ser dependencia de un paquete publico: o se empaquetan dentro, o el consumidor publico deja de necesitarlos."

### S3 — erradicar los 44 deep imports de @delendai/core/lib y endurecer el lint
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/core/src/public/index.ts`, `plugins/proposals/src/index.ts`, `plugins/commit-policy/src/lib/engine.ts`, `plugins/notification/src/lib/services/watcher.ts`, `plugins/conventions/src/lib/services/typescript-profile.service.ts`, `tools/scripts/lint/no-internal-core-imports.script.ts`
- **Gate**: type
- acceptance:
  - "Cero ocurrencias de @delendai/core/lib/ en packages/*/src y plugins/*/src."
  - "Lo que esos deep imports necesitaban esta expuesto por un subpath declarado en el exports de core."
  - "El lint deja de mirar solo zonas concretas: recorre todo paquete de PUBLISH_ORDER y falla ante cualquier import de un @delendai/* que no coincida con un subpath declarado por el paquete destino."
  - "El lint esta cableado en validate y pasa en verde."

### S4 — staging de npm aborta si sobrevive cualquier workspace:* sin reescribir
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `tools/scripts/release/release-plan.ts`, `tools/scripts/smoke/pack.script.ts`, `tools/tests/ci/pack-smoke.spec.ts`
- **Gate**: e2e
- acceptance:
  - "Tras la reescritura de dependencias, cualquier workspace:* remanente en un package.json empaquetado aborta el proceso con el nombre del paquete y de la dependencia."
  - "pack-smoke instala los tarballs de PUBLISH_ORDER en un proyecto limpio y arranca; hoy pasa en verde."

## acceptance

- El tipo IStateRegistry y sus tipos asociados viven en @delendai/contracts y @delendai/state los reexporta para no romper consumidores internos.
- packages/core/src/lib/plugins/plugin-contract.ts no importa @delendai/state.
- Si core sigue necesitando una implementacion concreta en runtime, o bien @delendai/state pasa a publico y se declara en dependencies, o bien la implementacion in-memory se mueve a core; la propuesta documenta cual de las dos se eligio y por que.
- grep de @delendai/state en packages/core/src devuelve cero, o devuelve solo imports respaldados por una dependencia declarada y publica.
- Ningun paquete de PUBLISH_ORDER tiene en dependencies ni en peerDependencies un paquete @delendai/* con private:true.
- Los paquetes que pasan a publicos declaran files, exports, main y types coherentes y entran en PUBLISH_ORDER en su posicion topologica.
- Los que siguen privados dejan de ser dependencia de un paquete publico: o se empaquetan dentro, o el consumidor publico deja de necesitarlos.
- Cero ocurrencias de @delendai/core/lib/ en packages/*/src y plugins/*/src.
- Lo que esos deep imports necesitaban esta expuesto por un subpath declarado en el exports de core.
- El lint deja de mirar solo zonas concretas: recorre todo paquete de PUBLISH_ORDER y falla ante cualquier import de un @delendai/* que no coincida con un subpath declarado por el paquete destino.
- El lint esta cableado en validate y pasa en verde.
- Tras la reescritura de dependencias, cualquier workspace:* remanente en un package.json empaquetado aborta el proceso con el nombre del paquete y de la dependencia.
- pack-smoke instala los tarballs de PUBLISH_ORDER en un proyecto limpio y arranca; hoy pasa en verde.
