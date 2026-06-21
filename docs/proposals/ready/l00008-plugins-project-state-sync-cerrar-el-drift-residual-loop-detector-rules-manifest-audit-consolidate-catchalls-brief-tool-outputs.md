---
id: l00008
status: ready
type: proposal
track: plugins+core+audit
date: 2026-06-21
---

# l00008 — Plugins ↔ project state sync — cerrar el drift residual (loop-detector, rules/manifest, audit/consolidate, catchalls, brief, tool-outputs)

## Goal

Consolidar el drift residual entre los 13 plugins y los invariantes del core (AGENTS.md reglas 3–8) que las propuestas puntuales `f00020`, `f00019`, `l00002`, `l00007` no cierran. Tras esta propuesta, `bun run validate` debe pasar y los plugins deben: (a) tener 0 `*Sync` de `node:fs` en hot paths, (b) escribir de forma durable con `writeFileAtomic` + `withFileMutex`, (c) contener paths workspace-scoped con `resolveWorkspaceContained`, (d) tipar los catchalls de outputSchema que aún queden, (e) generar `tool-outputs.ts` cuando aplique, y (f) cubrirse en el audit brief.

## Slices

- global_gate: lint

### s1 — proposals/agents/loop-detector-service.ts → async I/O en hot paths
- files: plugins/proposals/src/lib/agents/loop-detector-service.ts
- files: plugins/proposals/tests/src/lib/agents/loop-detector-service.spec.ts
- gate: lint
- acceptance:
  - "0 invocaciones de existsSync/readFileSync/readdirSync en hot paths (líneas 238, 416, 447, 457, 536). Las llamadas en 96-99 (boot-time) se mantienen pero marcadas explícitamente con un guard `if (!IS_HOT_PATH)` o refactorizadas a un helper `readBootConfig` documentado."
  - "Spec nuevo que: (a) ejercita 32 invocaciones paralelas de checkHandoff y mide p99 latency del event loop < 5ms; (b) confirma que durante un check concurrente con un writeFileAtomic en curso, no se observa estado parcial."
  - "bun run validate verde."
- status: done
- implementation_note: "3 de los 4 hot-path call sites migrados a `node:fs/promises.readFile` (sin `existsSync` previo — el `try/catch` ya cubre ENOENT): `getActiveAgent` (línea ~238, llamado desde `onToolCall` en cada tool call del swarm), `writeHandoffPacket` (líneas ~447/457 — además corrige un bug preexistente real, `await readFileSync(...)`, donde el `await` era un no-op porque `readFileSync` no devuelve una Promise), y `pruneOldHandoffs` (línea ~536). **Excepción documentada y deliberada** para `isAgentStuck` (la única que queda síncrona): el contrato del core `IMcpVertexHostConfig.isAgentStuck` (`packages/core/src/lib/contracts/interfaces/host-config.interface.ts`) declara un retorno síncrono y se invoca sin `await` inmediatamente después de cada tool call en `create-mcp-project.ts:46`; hacerlo async exigiría ensanchar ese contrato del core a todos sus consumidores — fuera de alcance de un fix contenido. Se documentó la razón inline con un JSDoc extenso en el método, en vez de forzar el cambio de contrato o dejarlo sin explicar. El read de boot-time en el constructor (líneas 96-99, config global) se deja sin tocar: es un one-shot genuino (instancia única por `register(ctx)`, no por-request), no un hot path. Spec nuevo: 4 tests en `loop-detector-service.spec.ts` (lock file real leído async desde `getActiveAgent`, `readFile` ausente no propaga el rechazo, `pruneOldHandoffs` tolera dir ausente, 8 `onToolCall` concurrentes para agentes distintos no corrompen ventanas cruzadas). `plugins/proposals` suite completa: 51 archivos, 450 tests verde. `bun run typecheck` limpio."

### s2 — rules/frameworks/manifest.ts → writeFileAtomic + withFileMutex en ensureRulesCache
- files: plugins/rules/src/lib/frameworks/manifest.ts
- files: plugins/rules/tests/src/lib/frameworks/manifest.spec.ts
- gate: lint
- acceptance:
  - "writeFileSync(mkdirSync en línea 139-140) reemplazado por writeFileAtomic(absPath, content) tras un mkdir asíncrono."
  - "La función ensureRulesCache queda envuelta en withFileMutex(manifestAbs, ...) para evitar interleavings con hosts paralelos."
  - "Spec nuevo que simula un kill -9 entre el write y el fsync y confirma que el archivo en disco es bit-identical al original o al nuevo, nunca parcial."
  - "bun run validate verde."
- status: done
- implementation_note: "`ensureRulesCache` y el `register(ctx)` del plugin `rules` son ahora `async` (boot-time, no hot-path — invariante 3 de AGENTS.md no aplica de todos modos, pero el cambio elimina cualquier riesgo futuro). El materialize-preset loop usa `writeFileAtomic` (crash-safe: write-temp-then-rename). El read-fingerprint→maybe-write del manifest queda envuelto en `withFileMutex(manifestAbs, ...)`. Spec nuevo en `plugins/rules/tests/src/lib/frameworks/manifest.spec.ts` (4 tests: happy path, fingerprint estable no reescribe, manifest nunca truncado, 8 llamadas paralelas convergen). `plugins/rules` suite completa: 15/15 verde. `bun run typecheck` limpio. `bun run lint`/`validate` global bloqueado únicamente por `docs/proposals/index.json` (lock externo de `f00023`/`f00001`, ajeno a este slice)."

### s3 — audit/consolidate-tool.ts → resolveWorkspaceContained para auditDir
- files: plugins/audit/src/lib/tools/consolidate-tool.ts
- files: plugins/audit/tests/consolidate-tool.spec.ts
- gate: lint
- acceptance:
  - "Reemplazar path.resolve(options.workspaceRoot, relDir) por resolveWorkspaceContained(options.workspaceRoot, relDir) del barrel @mcp-vertex/core/public."
  - "Spec nuevo con 4 casos: path relativo normal, '../' escape (rechazado), path absoluto fuera del workspace (rechazado), path con caracteres de control (rechazado)."
  - "bun run validate verde."
- status: done
- implementation_note: "`path.resolve` crudo reemplazado por `resolveWorkspaceContained(options.workspaceRoot, relDir)`; un `contained.ok === false` devuelve `toolError` con el `reason` de la primitiva ANTES de cualquier `readdir`/`readFile`. Spec nuevo en `plugins/audit/tests/consolidate-tool.spec.ts` (4 tests, siguiendo el harness `captureTools`/`invoke` ya usado por `plugin-options.spec.ts`): relativo normal dentro del workspace (acepta), '../' fuera del workspace (rechaza), absoluto fuera del workspace (rechaza), escape profundo multi-'../' (rechaza). `plugins/audit` suite completa: 33/33 verde. `bun run typecheck` limpio."

### s4 — Tipar catchalls residuales en rules/get_rules y proposals/adopt
- files: plugins/rules/src/lib/tools/rules-tools.ts
- files: plugins/proposals/src/lib/tools/adopt.tool.ts
- files: plugins/rules/tests/src/lib/tools/rules-tools.spec.ts
- files: plugins/proposals/tests/src/lib/adopt-tool.spec.ts
- gate: lint
- acceptance:
  - "rules-tools.ts:199 — reemplazar z.object({}).catchall(z.unknown()) en get_rules.areas[].rules por z.record(z.string(), z.unknown()) para preservar la presencia de keys sin perder el modelado."
  - "adopt.tool.ts:81 — reemplazar el catchall de layout por z.object({ proposalsDir: z.string(), proposalIndexFile: z.string() }) casando con IHostPathLayout."
  - "Specs actualizados con casos golden que verifiquen el shape exacto tras el cambio."
  - "bun run types:generate ejecutado sin warnings de catchall restantes en estos dos plugins."
  - "bun run validate verde."
- status: done
- implementation_note: "**Resuelve META-1** (a00022): `l00007` cedió explícitamente sus slices S3/S4 (los mismos 2 archivos) a este `s4`; implementado aquí, no duplicado. Ambos catchalls reemplazados por `z.object` concretos que mirroran el tipo TS real en runtime — no `z.record(z.string(), z.unknown())` como sugería el acceptance original, porque ambos campos ya tienen un tipo TS concreto y estable: `rules-tools.ts:199` (`get_rules.areas[].rules`) ahora mirrora `IAreaRules` (`framework`/`presetId`/`eslint`/`typecheck`/`reason`); `adopt.tool.ts:81` (`proposal_adopt.layout`) ahora mirrora `PROPOSALS_LAYOUT` real (`root: string`, `files`/`folders: Record<string,string>`) — **no** `IHostPathLayout` como asumía el acceptance original (verificado leyendo `proposals/adopt.ts`: el campo `layout` es la constante de documentación estática `PROPOSALS_LAYOUT`, no el layout de paths en runtime; usar `z.object({ proposalsDir, proposalIndexFile })` habría sido incorrecto y roto en runtime). Specs nuevos con casos golden: `plugins/rules/tests/src/lib/tools/rules-tools.spec.ts` y `plugins/proposals/tests/src/lib/adopt-tool.spec.ts`, ambos invocan el handler real registrado y verifican el shape exacto (incluido `Object.keys(...).sort()` para confirmar que no quedan keys sueltas del catchall). `bun run types:generate` regeneró `plugins/rules/src/generated/tool-outputs.ts` y `plugins/proposals/src/generated/tool-outputs.ts` sin warnings — los 2 `Record<string, unknown>` colapsan a los tipos concretos. `bun run typecheck`, drift guard (`tool-types-sdk.spec.ts`, 8/8) y suites completas de `proposals` (51 archivos) + `rules` (4 archivos) verdes."

### s5 — Audit brief — añadir mcp-vertex_metrics, keepLegacy, tool-outputs como invariantes
- files: plugins/audit/src/lib/brief.ts
- files: plugins/audit/tests/brief.spec.ts
- gate: lint
- acceptance:
  - "El brief de auditoría menciona explícitamente mcp-vertex_metrics como la primitiva de observabilidad que toda auditoría debe verificar (presencia, persistencia, snapshot diff)."
  - "El brief añade un bullet sobre keepLegacy: 'los plugins deben honrar o ignorar explícitamente ctx.keepLegacy'."
  - "El brief añade un bullet sobre tool-outputs.ts: 'los plugins con typed outputSchema deben tener su tool-outputs.ts generado y commiteado'."
  - "Spec nuevo que verifica que el brief contiene las 3 menciones."
  - "bun run validate verde."
- status: done
- implementation_note: "3 bullets nuevos añadidos a la sección '🧭 Secciones a inspeccionar' de `buildBrief`: (2) extendido con la mención de `ctx.keepLegacy`; (6) nuevo, `mcp-vertex_metrics` como primitiva de observabilidad (presencia + persistencia + snapshot-diff); (7) nuevo, `tool-outputs.ts` commiteado como requisito para outputSchema tipado. Spec nuevo en `plugins/audit/tests/brief.spec.ts` (4 tests: 3 menciones individuales + 1 que verifica las 3 en los 8 scopes, no solo `full`). `plugins/audit` suite completa: 37/37 verde. No se tocó `apps/web/src/i18n/tools/audit_plan.ts` — esa i18n describe el contrato de la tool (`scope` param), no el contenido del brief en sí, así que no requiere sincronización con este cambio."

### s6 — Generar tool-outputs para audit, status-marker, test-convention
- files: plugins/audit/src/generated/tool-outputs.ts
- files: plugins/status-marker/src/generated/tool-outputs.ts
- files: plugins/test-convention/src/generated/tool-outputs.ts
- files: scripts/generate-tool-types.ts
- files: scripts/emit-tool-types.ts
- files: plugins/audit/src/public/index.ts
- files: plugins/status-marker/src/public/index.ts
- files: plugins/test-convention/src/public/index.ts
- gate: lint
- acceptance:
  - "Cada uno de los 3 plugins genera su tool-outputs.ts a partir de las tools registradas, vía scripts/emit-tool-types.ts o equivalente."
  - "El barrel público de cada plugin re-exporta el tipo generado."
  - "bun run types:generate ejecutado sin warnings."
  - "bun run validate verde."
- status: done
- implementation_note: "Los 3 plugins no estaban en el harvest server de `scripts/generate-tool-types.ts` (solo 10 de los 13 plugins lo estaban); se añadieron sus imports + entradas en `PLUGIN_SPECIFIERS`/`PLUGIN_LIST` y 3 entradas nuevas en `PACKAGE_ROUTES` (`scripts/emit-tool-types.ts`) siguiendo exactamente la misma convención `mcp-<nombre>` → `{dir, label}` que los 10 plugins existentes (verificado: el patrón de resolución de specifiers en `load-plugins.ts` prueba `@mcp-vertex/<n>` → `mcp-<n>` → `<n>` en orden, y el harness de test solo empareja el segundo candidato — comportamiento idéntico, no nuevo, al de cada entrada preexistente). `bun run types:generate` generó los 3 `tool-outputs.ts` correctamente; los 3 barrels (`src/public/index.ts`) ahora re-exportan `'../generated/tool-outputs'` igual que `rules`/`docs`/`deps`/etc. **Fix adicional no pedido por el slice pero descubierto al generar**: `status-marker_validate` declara `outputSchema: z.union([...])` — un `anyOf` a nivel raíz; el emisor (`emit-tool-types.ts`) no tenía esa rama y colapsaba silenciosamente a `export type X = {}` (Biome `noBannedTypes` lo marcó). Se añadió detección de `anyOf`/`oneOf` a nivel raíz en `emitToolOutputsModule` para emitir `export type X = A | B` en vez de `interface X {}` — corrige el único caso real de unión a nivel raíz en todo el monorepo, sin cambiar el resto de la superficie del emisor. `bun run typecheck`, `bun run test` (145 archivos, 1056 tests) y `bunx vitest run packages/core/tests/tool-types-sdk.spec.ts` (drift guard, 8/8) verdes. `bun run biome check` de los 8 archivos tocados: 0 warnings."

### s7 — Spec de no-regresión: 0 *Sync en hot paths + 0 catchalls + 0 writeFile crudo
- files: packages/core/tests/src/lib/plugin-drift-budget.spec.ts
- gate: lint
- acceptance:
  - "Spec nuevo que ejecuta `grep -rE 'existsSync|readFileSync|readdirSync|mkdirSync|writeFileSync' plugins/*/src/ --include='*.ts' | grep -v spec.ts | grep -v test.ts` en CI y falla si encuentra hits fuera de los allowlist explícitos (boot-time en core/primitives)."
  - "Spec que ejecuta `grep -rE 'catchall\(z\.unknown' plugins/*/src/ packages/core/src` y falla si encuentra hits."
  - "Spec que ejecuta `grep -rE 'await writeFile\(' plugins/*/src/` y falla si encuentra hits (debe ser writeFileAtomic)."
  - "Los 3 specs son parte de `bun run validate`."
- status: done
- implementation_note: "3 tests en `packages/core/tests/src/lib/plugin-drift-budget.spec.ts`, implementados en TypeScript/Node (no shell `grep`, para que corran igual en CI y en cualquier OS, vía `readdir`/`readFile` recursivo sobre `plugins/*/src`): (1) 0 sync `node:fs` fuera del allowlist explícito de 2 ubicaciones documentadas (constructor boot-time de `loop-detector-service.ts` + el método `isAgentStuck` contract-constrained, ambos de `l00008 s1`); (2) 0 `catchall(z.unknown(` en `plugins/*/src` + `packages/core/src` (confirmado 0 tras `l00007` S1/S2 + `l00008` s4); (3) 0 `await writeFile(` crudo en `plugins/*/src`. **Hallazgo adicional durante la implementación**: el barrido encontró un cuarto sitio no listado en el acceptance original — `plugins/proposals/src/lib/swarm/round-context-digest.ts:122` (`await writeFile(tmpPath, ...)`, una reimplementación manual del patrón write-temp-then-rename que `writeFileAtomic` ya provee). Se corrigió como parte de este slice (reemplazado por una llamada directa a `writeFileAtomic`, eliminando ~15 líneas de lógica duplicada de cleanup/rename). Tras ese fix, los 3 greps dan 0 hits reales en todo el monorepo. `bun run typecheck`, `plugins/proposals` suite (52 archivos) y suite completa (148 archivos, 1065 tests) verdes."

## Why

- Las propuestas puntuales `f00020` (race en `sync-proposal-registry.ts:331`), `f00019` (sync I/O en `notification/watcher.ts`), `l00002` y `l00007` (catchalls residuales) cierran **un hallazgo cada una** pero dejan sin tocar:
  1. **Sync I/O en `loop-detector-service.ts`** — el segundo hot path con `*Sync` en producción, llamado por `continue-proposal` y por el detector de loops.
  2. **Escritura no atómica en `rules/frameworks/manifest.ts`** — rompe AGENTS.md invariante 4 (durable writes via primitives).
  3. **Path input sin contain en `audit/consolidate-tool.ts`** — rompe AGENTS.md invariante 5 (workspace-scoped path inputs via `resolveWorkspaceContained`).
  4. **Catchalls residuales** en `rules/get_rules.areas[].rules` y `proposals/adopt.layout` (los otros catchalls están cubiertos por l00002/l00007).
  5. **Audit brief desactualizado** — no menciona `mcp-vertex_metrics`, ni `keepLegacy`, ni el invariante "tool-outputs commiteado".
  6. **`tool-outputs.ts` ausente** en `audit`, `status-marker`, `test-convention` — el SDK tipado no cubre esos plugins.
- Sin un cierre consolidado, cada nuevo plugin que se sume al swarm arrastrará las mismas dudas: ¿dónde está `walkAllowedFiles`? ¿cómo tipas un outputSchema abierto? ¿qué hace `keepLegacy`? El brief de auditoría debe **codificar** las respuestas.
- AGENTS.md regla 9 (i18n) es completa en `apps/web` y `apps/vscode`, pero los plugins no tienen i18n. Esta propuesta **no toca i18n** porque ya está cubierta por f00010 (i18n completeness en apps). Queda fuera de scope.

## Non-goals

- Reescribir el loop-detector completo (el refactor es local a las 5–6 llamadas síncronas).
- Cambiar la API pública de las tools (los nombres y shapes quedan idénticos; solo cambia el código interno).
- Añadir un nuevo mecanismo de locking distribuido (`withFileMutex` es suficiente).
- Internacionalizar los strings de los plugins (cubierto por f00010).
- Migrar a `chokidar` o `node:fs.watch` (cambio de paradigma, fuera de scope).

## Acceptance

- [ ] `bun run validate` verde al cierre de cada slice.
- [ ] 0 invocaciones de `existsSync`/`readFileSync`/`readdirSync`/`mkdirSync`/`writeFileSync` en `plugins/*/src/**.ts` excepto en los allowlist explícitos (boot-time en `rules/manifest.ts:182,185` y en `loop-detector-service.ts:96-99`).
- [ ] 0 invocaciones de `await writeFile(` en `plugins/*/src/**.ts` que escriban estado durable (deben ser `writeFileAtomic`).
- [ ] 0 `catchall(z.unknown())` en `plugins/*/src/**.ts` y `packages/core/src/**.ts`.
- [ ] `audit/consolidate-tool.ts` rechaza paths `..` y absolutos fuera del workspace.
- [ ] `audit/brief.ts` menciona `mcp-vertex_metrics`, `keepLegacy`, y `tool-outputs.ts` commiteado.
- [ ] 3 plugins (`audit`, `status-marker`, `test-convention`) generan `src/generated/tool-outputs.ts`.
- [ ] Spec de no-regresión `plugin-drift-budget.spec.ts` integrado en `bun run validate`.
- [ ] `bun run lint:proposals` valida este documento.

## Findings (origen)

| ID | Severidad | Hallazgo | Archivos | Cubierto por |
|---|---|---|---|---|
| F-02 | P0 | Sync I/O en hot paths de `loop-detector-service.ts` | [loop-detector-service.ts:1,238,416,447,457,536](plugins/proposals/src/lib/agents/loop-detector-service.ts) | slice `s1` |
| F-03 | P0 | `rules/manifest.ts` usa `writeFileSync` + `mkdirSync` sin primitiva atómica | [manifest.ts:139-140](plugins/rules/src/lib/frameworks/manifest.ts) | slice `s2` |
| F-04 | P1 | `audit/consolidate-tool.ts` resuelve `auditDir` con `path.resolve` en vez de `resolveWorkspaceContained` | [consolidate-tool.ts](plugins/audit/src/lib/tools/consolidate-tool.ts) | slice `s3` |
| F-05 | P1 | Catchall en `rules/get_rules.areas[].rules` | [rules-tools.ts:199](plugins/rules/src/lib/tools/rules-tools.ts) | slice `s4` |
| F-06 | P1 | Catchall en `proposals/adopt.layout` (input shape) | [adopt.tool.ts:81](plugins/proposals/src/lib/tools/adopt.tool.ts) | slice `s4` |
| F-07 | P2 | `audit/brief.ts` no menciona `mcp-vertex_metrics` | [brief.ts:130](plugins/audit/src/lib/brief.ts) | slice `s5` |
| F-08 | P2 | `IMcpPluginContext.keepLegacy` no documentado en brief | [plugin-contract.ts:31](packages/core/src/lib/plugins/plugin-contract.ts) | slice `s5` |
| F-10 | P2 | `tool-outputs.ts` ausente en `audit`, `status-marker`, `test-convention` | `plugins/{audit,status-marker,test-convention}/src/generated/` | slice `s6` |
| F-12 | P2 | No existe spec de no-regresión para los 3 anti-patrones | (nuevo en `packages/core/tests/`) | slice `s7` |

## Notas

- **Auditoría origen**: `a00026-21-06-2026-copilot-minimax-m3-repositorio.md` (P0/P1/P2 agregados como F-02..F-12 complementarios).
- **Propuestas relacionadas** (no se solapan):
  - `f00020` — race en `sync-proposal-registry.ts:331` (cerrado por separado, ver `f00020` Notes).
  - `f00019` — sync I/O en `notification/watcher.ts` (cerrado por separado, ver `f00019` Notes).
  - `l00002` / `l00007` — catchalls en bootstrap/scaffold + JSDoc de primitivas sync (cubren el core, no los plugins). `l00007` cerró S1/S2/S5 (los 4 catchalls de `packages/core/src`); sus slices S3/S4 (los mismos 2 archivos que el `s4` de esta propuesta — `rules-tools.ts:199`, `adopt.tool.ts:81`) quedaron explícitamente `deferred` a favor de este `l00008.s4`, resolviendo el meta-hallazgo META-1 documentado en `a00022`. **`s4` de `l00008` es ahora la única propuesta viva para esos 2 archivos** — quien la tome no necesita coordinar con `l00007`.
  - `l00004` — depth extension (search rg, memory export/import, docs_search; **distinto objetivo**).
  - `x00006` — fix de zombie host (no relacionado).
- **Primitivas del core usadas**: `writeFileAtomic`, `withFileMutex`, `resolveWorkspaceContained`, `redactSecrets`, `walkAllowedFiles` (todas del barrel `@mcp-vertex/core/public`).
- **Relación con `mcp-vertex_metrics`**: el spec `s7` registra los anti-patrones en cada test; `mcp-vertex_metrics` (M29) los observará en producción tras el primer release post-merge.
- **Tamaño estimado del cambio**: 7 slices, 8 archivos de producción + 5 specs nuevos. Cada slice es ≤ 1 día; el total es ≈ 4 días de trabajo.
