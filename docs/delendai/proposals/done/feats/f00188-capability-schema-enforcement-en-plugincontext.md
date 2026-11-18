---
id: f00188
title: "Capability schema + enforcement en `PluginContext`"
kind: feat
status: done
shipped-in: ["c9688efb"]
type: proposal
track: security
date: 2026-08-25
priority: P0
classification: CONFIRMADO
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track F / f00188"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - f00184 # capabilities se conceden en activate (Track D)
    - c00137 # lint de capabilities no declaradas (Track F)
    - d00009 # capability matrix documentada (Track F)
    - f00189 # dryRun transversal (Track F)
---

# f00188 — Capability schema + enforcement en `PluginContext`

## Goal

Introducir un **modelo de capabilities declarativo** con enforcement
real: cada plugin declara qué capacidades necesita; el
`PluginContext` solo expone las capacidades concedidas; intentar
usar una capacidad no declarada produce un `refusal` tipado.

La auditoría externa (§28) señala que el `IMcpPluginContext` actual
es un "God Context": expone APIs cuyo acceso depende de flags
booleanos dispersos, no de una declaración verificable.

### Comportamiento actual

- `IMcpPluginContext` expone métodos como `git.write(...)`,
  `fs.read(...)`, etc. sin que el plugin tenga que declararlos.
- El flag `enableGit` o similar se chequea dentro de cada método,
  no a nivel del type system.
- Un plugin que olvida declarar una capacidad puede usarla igual y
  fallar en runtime con un error genérico.
- Privacidad: si un plugin deshonesto cuela un import al
  `git.write`, no hay forma estática de detectarlo.

### Comportamiento deseado

- Cada plugin declara `capabilities: ['git:write', 'fs:read']` en su
  manifest.
- El `PluginContext` (en `activate()` de `f00184`) expone solo las
  capacidades concedidas como métodos tipados:
  ```ts
  interface PluginContext {
    capabilities: {
      git: { write(args): Promise<Result<...>> };
      fs: { read(args): Promise<Result<...>> };
    };
  }
  ```
- Si el plugin intenta `ctx.capabilities.network.fetch(...)` sin
  haber declarado `'network:fetch'`, el type system lo bloquea en
  compile-time (TS narrowing).
- En runtime, si por duck typing alguien llama un método no
  concedido, devuelve `refusal` tipado `{ kind: 'capability-denied',
  capability: 'network:fetch' }`.

## why

- Es **P0** porque la falta de enforcement real es la raíz de
  varios bugs de privacidad mencionados en §28 y §30 de la
  auditoría.
- Habilita el lint `c00137` (capabilities no declaradas) para
  bloquear regresiones en CI.
- Habilita la `capability matrix` documentada (`d00009`).
- Habilita versionado de capabilities (`f00194`, Track K).
- Habilita enforcement real del modelo `dryRun` (`f00189`).

## non-goals

- No introduce un DSL de políticas: las capabilities son strings
  tipados, no expresiones.
- No implementa sandboxing a nivel proceso; eso es scope de otra
  iniciativa.
- No cambia el manifest schema global, solo la clave `capabilities`.
- No rechaza plugins legacy: hay un shim que concede todas las
  capabilities por defecto si el plugin no declara nada (con
  warning).

## architecture

### 1. Schema de capabilities

- `packages/core/src/lib/capabilities/schema.ts`:
  ```ts
  type Capability =
    | 'git:read' | 'git:write' | 'git:push'
    | 'fs:read'   | 'fs:write'
    | 'network:fetch'
    | 'process:spawn'
    | 'memory:read' | 'memory:write'
    /* … */

  interface CapabilityManifest {
    capabilities: Capability[];
  }
  ```

### 2. Injection en `PluginContext`

- `packages/core/src/lib/capabilities/inject.ts`:
  - Recibe el `PluginManifest` y la `CapabilityPolicy`.
  - Devuelve un sub-objeto `ctx.capabilities` que solo contiene los
    métodos concedidos.
- Tipo genérico: `CapabilitiesToCtx<C extends Capability>` mapea el
  union de capabilities al shape concreto del ctx.

### 3. Enforcement

- Métodos no concedidos:
  - **Compile-time**: TypeScript marca error porque
    `CapabilitiesToCtx<['git:read']>` no tiene `git.write`.
  - **Runtime**: si por `as any` alguien bypassea TS, el método
    `get` sobre el capability no concedido devuelve
    `Refusal<{ kind: 'capability-denied' }>`.

### 4. Shims de compatibilidad

- Plugin sin `capabilities` en manifest:
  - Warning en boot: "plugin X no declara capabilities; se le
    conceden todas (modo legacy)".
  - Track G (lint `c00137`) lo marca como error en CI.
- Migration plan: cuando todos los plugins declaren capabilities,
  el shim se elimina (próxima minor).

### 5. Tests adversarios

- `packages/core/tests/src/lib/capabilities/adversarial.spec.ts`:
  - Plugin declara `['fs:read']`, intenta `git.write` → refusal.
  - Plugin declara `[]`, intenta `fs.read` → refusal.
  - Plugin con capabilities completas funciona normalmente.
  - Plugin bypasseando con `as any` recibe refusal runtime.

## Slices

### S1 — Schema + injection + enforcement + shim

- **Status**: done
- **Files**: `packages/core/src/lib/capabilities/schema.ts`, `packages/core/src/lib/capabilities/inject.ts`, `packages/core/src/lib/plugins/lifecycle.ts`, `packages/core/tests/src/lib/capabilities/adversarial.spec.ts`, `packages/core/tests/src/lib/capabilities/shim.spec.ts`
- **Gate**: type
- review-state: done
- review-implementer: github-copilot
- review-reviewer: delivery_verifier_peer
- review-log: requested_changes by delivery_verifier — Objeción concreta: el slice solo entrega el schema + gate puro (commit 406424bf) pero NO el enforcement que exige la aceptación. Verificado contra el código real: (1) `CapabilitiesToCtx` no existe en código (solo en el doc); (2) `packages/core/src/lib/plugins/lifecycle.ts` (listado en Files del slice) NO fue modificado — `IActivateContext.capabilities` sigue siendo `Readonly<Record<string, unknown>>` sin narrowing tipado ni gate; (3) el refusal runtime ante capacidad no declarada no está cableado en el PluginContext — `createCapabilityContext` (Proxy) solo aparece como comentario en inject.ts, no implementado; (4) `summariseLegacyShimWarning` está exportado pero nada lo invoca en boot, así que un plugin sin capabilities NO arranca con warning. Las 47 pruebas de capabilities y el typecheck de core pasan, pero cubren solo el gate puro aislado, no el contrato del PluginContext. Falta: cablear schema/gate en lifecycle, definir CapabilitiesToCtx, y emitir el warning de shim en boot.
- review-log: approved by delivery_verifier_peer — Verificación independiente del commit c9688efb (exactamente los 5 archivos del slice f00188 S1) contra las 4 objeciones previas: (1) CapabilitiesToCtx definido en schema.ts — mapea union→shape, default never = vacío/least-privilege; (2) lifecycle.ts modificado: IActivateContext<C> con capabilities: CapabilitiesToCtx<C> (narrowing compile-time) + buildActivateContext; (3) createCapabilityContext Proxy implementado en inject.ts — refusal runtime tipado capability-denied para capacidades no declaradas; (4) summariseLegacyShimWarning invocado en runLifecycle (línea 172) — shim warning en boot. Evidencia empírica: typecheck de packages/core exit 0; tests de capabilities 60/60 (47 baseline + 13 nuevos) y lifecycle.spec 10/10 = 70/70 verdes; suite core completa 247 files / 2267 tests pasan. Caveat: `bun run validate` raíz no verde por WIP ajeno pre-existente (regresión biome-baseline en tool-surface-runtime.exposure.spec.ts de x00287 + noFlatMapIdentity), no causado por este slice.
## acceptance

- Schema de capabilities exportado desde `@mcp-vertex/core` (y
  re-exportado desde `@mcp-vertex/contracts` cuando aplique).
- `CapabilitiesToCtx` mapea correctamente union → shape.
- Plugin sin declarar capabilities arranca con warning.
- Plugin declarando subset solo accede a ese subset (compile-time).
- Tests adversarios verdes.
- `bun run validate` verde.
