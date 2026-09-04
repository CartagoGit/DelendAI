---
id: r00041
title: "`@delendai/client` deja de arrastrar el core en runtime"
kind: refactor
status: ready
type: proposal
track: architecture
date: 2026-08-29
parent-plan: q00011
audit-source:
    file: docs/delendai/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-E04
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P2
related: [q00011, r00040]
---

# r00041 — `@delendai/client` deja de arrastrar el core en runtime

## Goal

Que instalar `@delendai/client` no arrastre en runtime las 87.900
líneas de `@delendai/core` ni sus dependencias de Node
(`node:fs`, `node:child_process`), degradando la dependencia a
opcional y aislando el único uso real de valores en runtime del core
(`createFileSystemBatchWriter`) detrás de un subpath `client/node`.

## why

**Verificación de la premisa.** Confirmado en
`packages/client/package.json`: `"@delendai/core": "workspace:*"`
vive en `dependencies` (no `peerDependencies`, no `devDependencies`).
Confirmado con `grep -rln "@delendai/core" packages/client/src`: 12
ficheros lo referencian, y de ellos **11 usan `import type`** — el
cliente ya practica en su mayoría la disciplina que la solución ideal
pide (`packages/client/src/public/index.ts:197-202` incluso lo
documenta explícitamente en un comentario: *"la interfaz pública del
cliente expone sólo tipos de `@delendai/core/contracts`, no valores
runtime de `@delendai/core/public`"*). El único import de **valor**
(no tipo) en runtime es:

```ts
// packages/client/src/lib/scaffold/write-scaffolded-files.ts:25
import { createFileSystemBatchWriter } from '@delendai/core/public';
```

El hallazgo se sostiene exactamente como lo describe `AUD-E04`, pero
con un matiz importante para el diseño: **no es un problema
generalizado en el código del cliente, es un único punto de fuga** en
un módulo (`scaffold/`) que ya opera sobre el filesystem local — no en
`transport/` ni en el flujo de comunicación MCP en sí.

**Por qué es un problema.** Un cliente MCP debería poder hablar con
cualquier servidor sin instalar ese servidor. Hoy, instalar
`@delendai/client` para sólo transporte (hablar con el protocolo)
arrastra el árbol entero del core, cerrando la puerta a un cliente de
navegador — objetivo plausible dado que el repo ya tiene `apps/web` y
`packages/ui-extension`.

## why this design

Se descarta reescribir `createFileSystemBatchWriter` desde cero en el
cliente: ya existe, está probado, y vive en el core porque el propio
tool de scaffold del servidor lo usa igual. La opción de menor riesgo
es **mover** (no duplicar) la función a un subpath nuevo
`@delendai/client/node` cuyo único propósito es reunir el código del
cliente que sí necesita Node — de modo que sólo quien importe
explícitamente `client/node` paga el coste de `node:fs`.

Se prefiere partir el cliente en subpaths (`contracts`, `transport`,
`node`) en vez de sólo mover un fichero y llamarlo terminado, porque
sin un lint de fronteras el próximo import de conveniencia
(`node:child_process`, otro helper del core) reintroduce el mismo
problema en silencio — el patrón ya existe en el repo
(`lint:architecture-readfile-via-safe-reader`) y es barato de
replicar.

## non-goals

- Construir un cliente de navegador real — esta propuesta sólo deja
  la puerta abierta (separando `transport`/`contracts` de `node`), no
  implementa un transporte compatible con `fetch`/WebSocket para
  navegador.
- Tocar `r00040` (subpaths del core) — esta propuesta ya puede migrar
  hoy a `@delendai/core/contracts`, que existe independientemente de
  cómo evolucione el resto del barrel.
- Eliminar `@delendai/core` de `dependencies` por completo — pasa a
  `peerDependencies` opcional (sigue siendo instalable junto al
  cliente para quien use scaffold), no se corta el vínculo.

## architecture

```
packages/client/src/
  contracts/   → sólo tipos, `import type * from '@delendai/core/contracts'`
  transport/   → stdio/http, CERO imports de node:* o @delendai/core
  node/        → createFileSystemBatchWriter (movido), write-scaffolded-files.ts
                 (movido), y cualquier otro uso real de node:fs/@delendai/core/public
  scaffold/    → re-exporta desde node/ (compat) o se fusiona en node/

package.json:
  dependencies: { "@modelcontextprotocol/sdk", "zod" }          (sin core)
  peerDependencies: { "@delendai/core": "workspace:*" }         (opcional)
  peerDependenciesMeta: { "@delendai/core": { "optional": true } }
  exports: { ".", "./public", "./contracts", "./transport", "./node" }
```

## slices

### S1 — Test de frontera: nada fuera de `client/node` importa `node:*` ni `@delendai/core` como valor

- **Status**: done (verified 2026-09-02: `bunx vitest run packages/client/tests/architecture/no-node-outside-client-node.spec.ts` → 6/6 pass)
- **Files**:
    - `packages/client/tests/architecture/no-node-outside-client-node.spec.ts` (nuevo,
      siguiendo el patrón de
      `lint:architecture-readfile-via-safe-reader`)
- **Gate**: `bunx vitest run packages/client/tests/architecture/no-node-outside-client-node.spec.ts`
  — este slice se implementa **antes** de mover nada, así que debe
  fallar primero contra `write-scaffolded-files.ts` (confirma que
  detecta el caso real) y sólo pasar tras S2.

### S2 — Mover `write-scaffolded-files.ts` (y su import de `createFileSystemBatchWriter`) a `client/node`

- **Status**: done (verified 2026-09-02: `packages/client/src/node/scaffold/write-scaffolded-files.ts` holds the real implementation; `packages/client/src/lib/scaffold/write-scaffolded-files.ts` is a compat re-export; S1's boundary test passes against this layout)
- **Files**:
    - `packages/client/src/lib/scaffold/write-scaffolded-files.ts` →
      `packages/client/src/node/write-scaffolded-files.ts`
    - `packages/client/src/node/index.ts` (nuevo)
    - cualquier importador interno de `write-scaffolded-files.ts`
      (localizar con `grep -rln "write-scaffolded-files" packages/client/src`)
- **Gate**: `bunx vitest run packages/client/tests/architecture/no-node-outside-client-node.spec.ts`

### S3 — Subpaths `client/contracts` y `client/transport` + smoke sin `@types/node`

- **Status**: done (2026-09-04: `bunx vitest run packages/client/tests/build/contracts-transport-no-node-types.spec.ts` → 2/2; the compile was proven to FAIL by reinstating the `Buffer` annotation it found)
- **Files**:
    - `packages/client/package.json` (`exports`, nuevos subpaths)
    - `packages/client/tsconfig.contracts.json` / equivalente (nuevo,
      `"lib": ["ES2022", "DOM"]`, sin `@types/node`)
    - `packages/client/tests/build/contracts-transport-no-node-types.spec.ts` (nuevo)
- **Gate**: `bunx vitest run packages/client/tests/build/contracts-transport-no-node-types.spec.ts`

### S4 — Degradar `@delendai/core` a `peerDependencies` opcional

- **Status**: in-progress (S3 landed 2026-09-04; no longer blocked)
- **Files**:
    - `packages/client/package.json`
    - `packages/client/tests/build/optional-core-peer.spec.ts` (nuevo:
      instalar el cliente sin el core presente y confirmar que
      `client/contracts` + `client/transport` siguen funcionando)
- **Gate**: `bunx vitest run packages/client/tests/build/optional-core-peer.spec.ts`

## dependency graph

Se beneficia de `r00040` si ese proposal reduce el barrel del core
antes, pero no depende de él: `@delendai/core/contracts` ya existe
hoy y es el único subpath que esta propuesta necesita para los tipos.
Dentro de esta propuesta: S1 no depende de nada (se implementa primero
para que falle contra el estado actual); S2 depende de S1; S3 es
independiente de S2 y puede ir en paralelo; S4 depende de S2 y S3
(necesita que el único uso runtime ya esté aislado en `client/node`
antes de poder declarar el core como opcional).

## acceptance

- El bundle de `client/transport` no contiene código del core (test de
  frontera de S1/S2 en CI).
- `client/contracts` y `client/transport` compilan con
  `"lib": ["ES2022", "DOM"]` sin `@types/node` en el classpath (S3).
- Instalar `@delendai/client` sin `@delendai/core` presente permite
  seguir usando `client/contracts` y `client/transport` (S4).

## risks and mitigations

- **Riesgo: algún consumidor externo ya importa
  `write-scaffolded-files` desde su ruta actual
  (`lib/scaffold/...`).** Mitigación: S2 deja un re-export desde la
  ruta antigua marcado como deprecado en vez de borrarla directamente,
  con la misma ventana de compatibilidad que usa `r00040` para el
  barrel del core.
- **Riesgo: partir en subpaths sin terminar de mover todo el código de
  Node dificulta el mantenimiento a medio camino.** Mitigación: el
  test de frontera de S1 se implementa y se deja en CI **antes** de
  mover el fichero, así que cualquier nuevo import de conveniencia
  que reintroduzca el problema falla inmediatamente, no sólo cuando
  alguien vuelva a auditar el repo.

## notes

Confirmado en esta sesión que el cliente ya practica correctamente
`import type` en 11 de 12 puntos de contacto con el core — el
problema real es puntual (un fichero, un import de valor), no
sistémico. El diseño de esta propuesta refleja eso: no es una reescritura
grande del cliente, es aislar el único punto de fuga real y poner un
test que impida que reaparezca.

### 2026-09-02 — S1/S2 verified already done; S3 blocked by an upstream finding

S1 and S2 were already implemented in `develop` before this session
(found via `git log`, landed under an unrelated commit message) —
verified genuinely, not just present: the boundary spec
(`no-node-outside-client-node.spec.ts`) passes 6/6, and
`write-scaffolded-files.ts` really lives under `src/node/scaffold/`
with a re-export left at the old path for compat, exactly as S2
specifies.

S3 was attempted and reverted. A `tsconfig.contracts.json` with
`"lib": ["ES2022", "DOM"]` and `"types": []` compiling
`src/lib/contracts/**` + `src/lib/transport/**` fails, and not for a
reason fixable inside `packages/client`:

- `src/lib/transport/mcp-stdio-client.ts:245` uses the ambient
  `Buffer` type directly in a stderr-data callback — a real,
  independent small violation S1's own boundary test does not catch
  (it only flags `node:*`/`@delendai/core` *import specifiers*, not
  ambient global type usage). Fixable in isolation.
- The blocking issue is upstream: `src/lib/contracts/interfaces/{tool-descriptor,plugin-activation}.interface.ts`
  do `import type { X } from '@delendai/core/contracts'`, and
  TypeScript type-checks the **full** target module to resolve `X`
  even for a type-only re-export. `@delendai/core/contracts`'s own
  barrel (`packages/core/src/contracts/index.ts`) re-exports types
  from implementation files (`../lib/cli/graceful-shutdown`,
  `../lib/shared/with-file-mutex`, etc.) that use ambient `process`,
  `Buffer`, and `NodeJS.*` — so any tsconfig without `@types/node`
  fails on files the client never asked to compile. This is not a gap
  in the client; it is `@delendai/core/contracts` not actually being
  library-safe despite its own doc comment claiming "no Node-only
  modules". Fixing it is core's responsibility (adjacent to `r00040`'s
  barrel work, not this proposal's declared file scope), so it was not
  attempted here — doing it as a side effect of r00041 would be scope
  creep into a different proposal's territory.
- No files were left half-changed: the experimental
  `tsconfig.contracts.json` was deleted after confirming the failure
  mode; `git status` is clean on this proposal's slices beyond the
  status notes above.

S4 depends on S3 and is blocked transitively. Proposal stays in
`ready/`: 2 of 4 slices are genuinely complete, 2 are blocked on a
cross-cutting core fix outside this proposal's scope.

### 2026-09-04 — the upstream blocker is fixed; S3 unblocked

The 2026-09-02 note above diagnosed S3's blocker correctly and left it
alone on scope grounds. That blocker no longer exists.

`@delendai/core/contracts` is now genuinely library-safe. Measured, not
asserted: compiling `packages/core/src/contracts/index.ts` with
`"types": []` and `"lib": ["ES2022", "DOM"]` went from 20 errors across
6 modules to **0**. The cause was exactly as diagnosed here — resolving
a re-exported type makes TypeScript check the entire target module — and
the fix was to relocate the six leaking type groups into
`packages/core/src/lib/contracts/interfaces/`, leaving
`export type { X };` behind in each implementation module so no existing
importer changed:

| type(s) | was re-exported from | now lives in |
| --- | --- | --- |
| `IGracefulShutdownOptions` | `lib/cli/graceful-shutdown` | `graceful-shutdown.interface.ts` |
| `IDelendaiProject` | `lib/project/create-mcp-project` | `delendai-project.interface.ts` |
| `IPushForceMode`, `IPushOptions`, `ICommitAndPushOptions`, `ICommitAndPushResult` | `lib/shared/git-write` | `git-write.interface.ts` |
| `IDelendaiCliArgs` | `lib/plugins/parse-cli-args` | `cli-args.interface.ts` |
| `RuntimeEventKind`, `IRuntimeEvent`, `RuntimeEventInput`, `IRuntimeEventSink` | `lib/observability/runtime-events` | `runtime-event.interface.ts` |

A new gate, `lint:core-contracts-library-safe`, runs that compile in
`validate` so it cannot regress. It was proven to fail by reinstating
the `IDelendaiProject` re-export, which it caught along with the five
transitive modules it drags in.

Two things this does NOT resolve, which S3 still owns:

- `src/lib/transport/mcp-stdio-client.ts:245` uses the ambient `Buffer`
  type. Independent of the core, and named in the 2026-09-02 note.
- S1's boundary test still only flags `node:*` / `@delendai/core` import
  specifiers, not ambient global type usage. S3 adding its own
  `tsconfig` compile is what closes that hole for the client, the same
  way the new core gate closed it for the core.
