---
id: r00041
title: "`@mcp-vertex/client` deja de arrastrar el core en runtime"
kind: refactor
status: ready
type: proposal
track: architecture
date: 2026-08-29
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-E04
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P2
related: [q00011, r00040]
---

# r00041 — `@mcp-vertex/client` deja de arrastrar el core en runtime

## Goal

Que instalar `@mcp-vertex/client` no arrastre en runtime las 87.900
líneas de `@mcp-vertex/core` ni sus dependencias de Node
(`node:fs`, `node:child_process`), degradando la dependencia a
opcional y aislando el único uso real de valores en runtime del core
(`createFileSystemBatchWriter`) detrás de un subpath `client/node`.

## why

**Verificación de la premisa.** Confirmado en
`packages/client/package.json`: `"@mcp-vertex/core": "workspace:*"`
vive en `dependencies` (no `peerDependencies`, no `devDependencies`).
Confirmado con `grep -rln "@mcp-vertex/core" packages/client/src`: 12
ficheros lo referencian, y de ellos **11 usan `import type`** — el
cliente ya practica en su mayoría la disciplina que la solución ideal
pide (`packages/client/src/public/index.ts:197-202` incluso lo
documenta explícitamente en un comentario: *"la interfaz pública del
cliente expone sólo tipos de `@mcp-vertex/core/contracts`, no valores
runtime de `@mcp-vertex/core/public`"*). El único import de **valor**
(no tipo) en runtime es:

```ts
// packages/client/src/lib/scaffold/write-scaffolded-files.ts:25
import { createFileSystemBatchWriter } from '@mcp-vertex/core/public';
```

El hallazgo se sostiene exactamente como lo describe `AUD-E04`, pero
con un matiz importante para el diseño: **no es un problema
generalizado en el código del cliente, es un único punto de fuga** en
un módulo (`scaffold/`) que ya opera sobre el filesystem local — no en
`transport/` ni en el flujo de comunicación MCP en sí.

**Por qué es un problema.** Un cliente MCP debería poder hablar con
cualquier servidor sin instalar ese servidor. Hoy, instalar
`@mcp-vertex/client` para sólo transporte (hablar con el protocolo)
arrastra el árbol entero del core, cerrando la puerta a un cliente de
navegador — objetivo plausible dado que el repo ya tiene `apps/web` y
`packages/ui-extension`.

## why this design

Se descarta reescribir `createFileSystemBatchWriter` desde cero en el
cliente: ya existe, está probado, y vive en el core porque el propio
tool de scaffold del servidor lo usa igual. La opción de menor riesgo
es **mover** (no duplicar) la función a un subpath nuevo
`@mcp-vertex/client/node` cuyo único propósito es reunir el código del
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
  hoy a `@mcp-vertex/core/contracts`, que existe independientemente de
  cómo evolucione el resto del barrel.
- Eliminar `@mcp-vertex/core` de `dependencies` por completo — pasa a
  `peerDependencies` opcional (sigue siendo instalable junto al
  cliente para quien use scaffold), no se corta el vínculo.

## architecture

```
packages/client/src/
  contracts/   → sólo tipos, `import type * from '@mcp-vertex/core/contracts'`
  transport/   → stdio/http, CERO imports de node:* o @mcp-vertex/core
  node/        → createFileSystemBatchWriter (movido), write-scaffolded-files.ts
                 (movido), y cualquier otro uso real de node:fs/@mcp-vertex/core/public
  scaffold/    → re-exporta desde node/ (compat) o se fusiona en node/

package.json:
  dependencies: { "@modelcontextprotocol/sdk", "zod" }          (sin core)
  peerDependencies: { "@mcp-vertex/core": "workspace:*" }         (opcional)
  peerDependenciesMeta: { "@mcp-vertex/core": { "optional": true } }
  exports: { ".", "./public", "./contracts", "./transport", "./node" }
```

## slices

### S1 — Test de frontera: nada fuera de `client/node` importa `node:*` ni `@mcp-vertex/core` como valor

- **Status**: pending
- **Files**:
    - `packages/client/tests/architecture/no-node-outside-client-node.spec.ts` (nuevo,
      siguiendo el patrón de
      `lint:architecture-readfile-via-safe-reader`)
- **Gate**: `bunx vitest run packages/client/tests/architecture/no-node-outside-client-node.spec.ts`
  — este slice se implementa **antes** de mover nada, así que debe
  fallar primero contra `write-scaffolded-files.ts` (confirma que
  detecta el caso real) y sólo pasar tras S2.

### S2 — Mover `write-scaffolded-files.ts` (y su import de `createFileSystemBatchWriter`) a `client/node`

- **Status**: pending
- **Files**:
    - `packages/client/src/lib/scaffold/write-scaffolded-files.ts` →
      `packages/client/src/node/write-scaffolded-files.ts`
    - `packages/client/src/node/index.ts` (nuevo)
    - cualquier importador interno de `write-scaffolded-files.ts`
      (localizar con `grep -rln "write-scaffolded-files" packages/client/src`)
- **Gate**: `bunx vitest run packages/client/tests/architecture/no-node-outside-client-node.spec.ts`

### S3 — Subpaths `client/contracts` y `client/transport` + smoke sin `@types/node`

- **Status**: pending
- **Files**:
    - `packages/client/package.json` (`exports`, nuevos subpaths)
    - `packages/client/tsconfig.contracts.json` / equivalente (nuevo,
      `"lib": ["ES2022", "DOM"]`, sin `@types/node`)
    - `packages/client/tests/build/contracts-transport-no-node-types.spec.ts` (nuevo)
- **Gate**: `bunx vitest run packages/client/tests/build/contracts-transport-no-node-types.spec.ts`

### S4 — Degradar `@mcp-vertex/core` a `peerDependencies` opcional

- **Status**: pending
- **Files**:
    - `packages/client/package.json`
    - `packages/client/tests/build/optional-core-peer.spec.ts` (nuevo:
      instalar el cliente sin el core presente y confirmar que
      `client/contracts` + `client/transport` siguen funcionando)
- **Gate**: `bunx vitest run packages/client/tests/build/optional-core-peer.spec.ts`

## dependency graph

Se beneficia de `r00040` si ese proposal reduce el barrel del core
antes, pero no depende de él: `@mcp-vertex/core/contracts` ya existe
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
- Instalar `@mcp-vertex/client` sin `@mcp-vertex/core` presente permite
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
