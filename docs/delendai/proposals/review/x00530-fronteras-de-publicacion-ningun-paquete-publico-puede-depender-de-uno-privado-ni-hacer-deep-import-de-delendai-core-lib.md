---
id: x00530
title: "Fronteras de publicacion: ningun paquete publico puede depender de uno privado ni hacer deep import de @delendai/core/lib"
kind: fix
status: review
type: proposal
track: architecture
date: 2026-09-08
last-transition-id: 1ab6b185-29ae-4565-a01a-814d23d2e95b
last-correlation-id: 1ab6b185-29ae-4565-a01a-814d23d2e95b
last-transition-from: in-progress
---

# x00530 — Fronteras de publicacion: ningun paquete publico puede depender de uno privado ni hacer deep import de @delendai/core/lib

## Goal

Dejar el conjunto PUBLISH_ORDER instalable desde npm en un proyecto limpio: cero dependencias hacia paquetes private:true y cero imports fuera de los subpaths declarados en exports.

## why

Auditoria 2026-09-08 sobre 6a5a9e5, tercera vez que se reporta sin resolver. (1) packages/core es publico y su package.json declara solo @delendai/contracts, pero importa @delendai/state en src/lib/cli/assemble.ts:43 (runtime) y en src/lib/plugins/plugin-contract.ts:26 (tipo IStateRegistry expuesto en el contrato PUBLICO de plugins); @delendai/state es private:true. (2) plugins/proposals es publico y declara en dependencies @delendai/state y @delendai/proposals-sqlite, ambos private:true: un npm install de @delendai/proposals no puede resolverlos. (3) packages/context-compiler depende de @delendai/state igual. (4) Hay 44 ocurrencias de import desde @delendai/core/lib/* en 20+ ficheros, incluido packages/core/src/public/index.ts, y core solo publica los subpaths ., ./public, ./cli, ./contracts, ./runtime, ./plugin, ./node. Existe un lint no-internal-core-imports pero su cobertura es parcial. El efecto combinado es que el snapshot no es publicable y que pack-smoke solo lo demuestra cuando llega a ejecutarse.

## non-goals

- No decidir en esta propuesta si @delendai/state pasa a publico o si su contrato migra a @delendai/contracts: S1 lo resuelve con datos, pero la decision se toma dentro de S1.
- No tocar los nombres publicos de las herramientas MCP.

### S1 decision record (2026-09-08)

La acceptance de S1 pedia elegir entre dos opciones y dejar escrito cual
y por que. **Se han aplicado las dos mitades, y no son alternativas: son
respuestas a dos preguntas distintas.**

**Mitad 1 — el TIPO. `IStateRegistry` y su cierre transitivo de tipos se
mueven a `@delendai/contracts` (`packages/contracts/src/state.ts`, nuevo
subpath `./state`).** `@delendai/core` expone `IStateRegistry` en
`IPluginContext.state`, que es superficie PUBLICA: un consumidor que
instale `@delendai/core` desde npm tiene que poder resolver ese tipo.
`@delendai/contracts` existe exactamente para eso (type-only, sin Node,
sin runtime, publicado). El cierre movido es: `StateBrand`, `Sha256Hex`,
`CanonicalJsonValue`, `CanonicalProjection`, los locators y `StateScope`,
los tipos de fingerprint, los de producer, los de generation y los de
registry. Se movieron SOLO declaraciones de tipo; el hashing canonico,
el fingerprinting y los helpers de snapshot siguen siendo runtime de
`@delendai/state`. `@delendai/state` reexporta cada nombre desde
`@delendai/contracts/state`, asi que todo `import type { ... } from
'@delendai/state'` existente (incluidos `@delendai/state-sqlite` y
`@delendai/proposals-sqlite`) sigue compilando sin tocar esos paquetes.

**Mitad 2 — la IMPLEMENTACION. `@delendai/state` pasa a publico y
`@delendai/core` la declara en `dependencies`.** Se descarto mover el
driver in-memory a core, que era la opcion "mas limpia" a primera vista,
porque el codigo real lo impide: `packages/state-sqlite/src/lib/sqlite-driver.ts`
usa `InMemoryStateRegistry` como delegate y `registry-facade.spec.ts` lo
instancia; si el driver viviera en core, `@delendai/state-sqlite` tendria
que depender de `@delendai/core`, que es precisamente la dependencia que
la descripcion de `@delendai/state` prohibe ("NO `@delendai/core`
dependency"). Ademas son 1091 lineas de driver con SHA-256 puro y sus
property tests, que pertenecen al paquete State Engine, no al core MCP.
Publicar `@delendai/state` es ademas la misma accion que S2 necesitaba
para `packages/context-compiler` y `plugins/proposals`: una decision
resuelve tres consumidores.

Resultado neto: `packages/core/src` no importa ningun tipo de
`@delendai/state` (el contrato viene de `@delendai/contracts/state`), y
el unico import que queda es el runtime `defineInMemoryStateRegistry` en
`assemble.ts`, respaldado por una dependencia declarada y publica —
que es literalmente la segunda mitad del cuarto criterio de S1.

## Slices

- global_gate: type

### S1 — IStateRegistry y el contrato de state salen a @delendai/contracts; core deja de importar @delendai/state en su superficie publica
- **Status**: done
- **Files**: `packages/contracts/src/index.ts`, `packages/core/src/lib/plugins/plugin-contract.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/package.json`, `packages/state/src/index.ts`
- **Gate**: type
- acceptance:
  - "El tipo IStateRegistry y sus tipos asociados viven en @delendai/contracts y @delendai/state los reexporta para no romper consumidores internos."
  - "packages/core/src/lib/plugins/plugin-contract.ts no importa @delendai/state."
  - "Si core sigue necesitando una implementacion concreta en runtime, o bien @delendai/state pasa a publico y se declara en dependencies, o bien la implementacion in-memory se mueve a core; la propuesta documenta cual de las dos se eligio y por que."
  - "grep de @delendai/state en packages/core/src devuelve cero, o devuelve solo imports respaldados por una dependencia declarada y publica."
- review-state: in_review
- review-implementer: claude-opus-5-implementer
### S2 — plugins/proposals y packages/context-compiler dejan de depender de paquetes privados
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/package.json`, `packages/context-compiler/package.json`, `packages/proposals-sqlite/package.json`, `packages/state/package.json`
- **Gate**: type
- acceptance:
  - "Ningun paquete de PUBLISH_ORDER tiene en dependencies ni en peerDependencies un paquete @delendai/* con private:true."
  - "Los paquetes que pasan a publicos declaran files, exports, main y types coherentes y entran en PUBLISH_ORDER en su posicion topologica."
  - "Los que siguen privados dejan de ser dependencia de un paquete publico: o se empaquetan dentro, o el consumidor publico deja de necesitarlos."
- review-state: in_review
- review-implementer: claude-opus-5-implementer
### S3 — erradicar los 44 deep imports de @delendai/core/lib y endurecer el lint
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `packages/core/src/public/index.ts`, `plugins/proposals/src/index.ts`, `plugins/commit-policy/src/lib/engine.ts`, `plugins/notification/src/lib/services/watcher.ts`, `plugins/conventions/src/lib/services/typescript-profile.service.ts`, `tools/scripts/lint/no-internal-core-imports.script.ts`
- **Gate**: type
- acceptance:
  - "Cero ocurrencias de @delendai/core/lib/ en packages/*/src y plugins/*/src."
  - "Lo que esos deep imports necesitaban esta expuesto por un subpath declarado en el exports de core."
  - "El lint deja de mirar solo zonas concretas: recorre todo paquete de PUBLISH_ORDER y falla ante cualquier import de un @delendai/* que no coincida con un subpath declarado por el paquete destino."
  - "El lint esta cableado en validate y pasa en verde."
- review-state: in_review
- review-implementer: claude-opus-5-implementer
### S4 — staging de npm aborta si sobrevive cualquier workspace:* sin reescribir
- **Status**: done (salvo el pack-smoke real, ver notas)
- **DependsOn**: [S2]
- **Files**: `tools/scripts/release/release-plan.ts`, `tools/scripts/smoke/pack.script.ts`, `tools/tests/ci/pack-smoke.spec.ts`
- **Gate**: e2e
- acceptance:
  - "Tras la reescritura de dependencias, cualquier workspace:* remanente en un package.json empaquetado aborta el proceso con el nombre del paquete y de la dependencia."
  - "pack-smoke instala los tarballs de PUBLISH_ORDER en un proyecto limpio y arranca; hoy pasa en verde."
- review-state: in_review
- review-implementer: claude-opus-5-implementer
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

### Implementation notes (2026-09-08)

**S2.** `@delendai/state` y `@delendai/proposals-sqlite` dejan de ser
`private: true`; ambos declaran `files`, `publishConfig.access` y entran
en `PUBLISH_ORDER` en su posicion topologica (`packages/state` justo
detras de `packages/contracts` y delante de `packages/core`;
`packages/proposals-sqlite` detras de `packages/core` y delante de
`plugins/proposals`). `packages/context-compiler` sigue privado, pero su
unica dependencia `@delendai/*` ya es publica, asi que deja de ser un
problema de frontera.

**S3.** Los 44 deep imports de `@delendai/core/lib/*` son cero. Lo que
necesitaban se expone ahora en `@delendai/core/public` (bloque final de
`packages/core/src/public/index.ts`): `isLockEntryExpired` /
`isLockEntryStale` / `isLockEntryOrphaned`, `ILockExpiryPolicy`,
`waitsBackOnto` / `findWaitForCycles` / `IWaitForEdge`,
`registerAdoptionExtensions` + sus tipos, `registerWorkflowContribution`,
`readProposalsIndex`, `IWorkflowContribution`, la familia
`CONTRACT_MIGRATION_*` / `IWorktreeImpactPolicy*`,
`registerStableToolDescriptors`, `resolveWorkspaceContainedEffective` y
`estimateResponseBytes`.

El deep import cruzado `@delendai/error-reporting ->
@delendai/commit-policy/lib/services/{storm-detector,push-circuit}` se
resolvio por **subpath publico**, no eliminando la arista. Motivo: el
consumidor reusa `StormDetector` precisamente para que un storm
diagnosticado desde un log y uno diagnosticado en proceso coincidan
(misma ventana, mismo umbral, misma clave `(trigger, code)`);
duplicar el detector para romper la arista introduciria justo la
divergencia que ese codigo existe para evitar. Los simbolos pasan a
`@delendai/commit-policy/public` y las dos entradas ad-hoc
`./lib/services/*` desaparecen del `exports` — entradas que ademas
declaraban `types` sin condicion `import`, es decir un subpath que
type-checkeaba en el monorepo y no resolvia desde un tarball. La arista
del ciclo sigue existiendo y es trabajo de x00535.

El lint `no-internal-core-imports.script.ts` gana una segunda mitad,
`publication-boundary`, que recorre TODO `PUBLISH_ORDER` (no dos scan
roots) y contrasta cada import `@delendai/*` contra el `exports` del
paquete destino: falla si el destino es `private: true`, si el subpath no
esta declarado, o si el subpath declarado no tiene condicion de runtime.
Comprueba ademas `dependencies` + `peerDependencies` de cada paquete de
`PUBLISH_ORDER` contra paquetes privados. Ya estaba cableado en
`validate:run` via `lint:cli-imports`.

**S4.** `rewriteWorkspaceDeps` ahora llama a
`assertNoWorkspaceRangesRemain` ANTES de escribir el manifiesto: si tras
la reescritura sobrevive cualquier `workspace:` en `dependencies`,
`peerDependencies` u `optionalDependencies`, aborta con
`ERR_WORKSPACE_DEPS_UNRESOLVED` nombrando paquete, seccion y dependencia.
`devDependencies` queda fuera a proposito: npm las publica pero nunca las
instala en el consumidor. El agujero exacto que tapa es
`collectChangedKeys`, que hacia `continue` cuando la dependencia no
estaba en el plan (es decir, cuando no estaba en `PUBLISH_ORDER`) y
copiaba el rango tal cual.

### Criterios que quedan abiertos

- "pack-smoke instala los tarballs de PUBLISH_ORDER en un proyecto
  limpio y arranca; hoy pasa en verde": NO verificado de extremo a
  extremo. `bun test tools/tests/ci/pack-smoke.spec.ts` pasa (7/7), pero
  ese spec cubre el wrapper y `assertPublishablePackagesArePacked`, no la
  instalacion real; el smoke completo necesita `bun run build`, que hoy
  falla por el ciclo de manifiestos de x00535 salvo con
  `DELENDAI_BUILD_ALLOW_CYCLES=1`.
- `plugins/observability/src/lib/testing/tool-spec-server.helper.ts`
  importa `@delendai/test-kit/public` (privado). Solo lo consumen specs,
  asi que el lint excluye los directorios `testing/` como test-support; el
  fichero SI se compila a `dist`, de modo que la exclusion es una
  concesion consciente y no una prueba de que sea inofensivo. Merece una
  propuesta aparte: mover el helper al arbol de tests o publicar
  `@delendai/test-kit`.
