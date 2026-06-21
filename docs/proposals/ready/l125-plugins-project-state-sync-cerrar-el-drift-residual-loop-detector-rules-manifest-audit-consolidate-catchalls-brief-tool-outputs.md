---
id: l125
status: ready
type: proposal
track: plugins+core+audit
date: 2026-06-21
---

# l125 — Plugins ↔ project state sync — cerrar el drift residual (loop-detector, rules/manifest, audit/consolidate, catchalls, brief, tool-outputs)

## Goal

Consolidar el drift residual entre los 13 plugins y los invariantes del core (AGENTS.md reglas 3–8) que las propuestas puntuales `f122`, `f123`, `l118`, `l122` no cierran. Tras esta propuesta, `bun run validate` debe pasar y los plugins deben: (a) tener 0 `*Sync` de `node:fs` en hot paths, (b) escribir de forma durable con `writeFileAtomic` + `withFileMutex`, (c) contener paths workspace-scoped con `resolveWorkspaceContained`, (d) tipar los catchalls de outputSchema que aún queden, (e) generar `tool-outputs.ts` cuando aplique, y (f) cubrirse en el audit brief.

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
- status: pending

### s2 — rules/frameworks/manifest.ts → writeFileAtomic + withFileMutex en ensureRulesCache
- files: plugins/rules/src/lib/frameworks/manifest.ts
- files: plugins/rules/src/lib/frameworks/manifest.spec.ts
- gate: lint
- acceptance:
  - "writeFileSync(mkdirSync en línea 139-140) reemplazado por writeFileAtomic(absPath, content) tras un mkdir asíncrono."
  - "La función ensureRulesCache queda envuelta en withFileMutex(manifestAbs, ...) para evitar interleavings con hosts paralelos."
  - "Spec nuevo que simula un kill -9 entre el write y el fsync y confirma que el archivo en disco es bit-identical al original o al nuevo, nunca parcial."
  - "bun run validate verde."
- status: pending

### s3 — audit/consolidate-tool.ts → resolveWorkspaceContained para auditDir
- files: plugins/audit/src/lib/tools/consolidate-tool.ts
- files: plugins/audit/tests/src/lib/tools/consolidate-tool.spec.ts
- gate: lint
- acceptance:
  - "Reemplazar path.resolve(options.workspaceRoot, relDir) por resolveWorkspaceContained(options.workspaceRoot, relDir) del barrel @mcp-vertex/core/public."
  - "Spec nuevo con 4 casos: path relativo normal, '../' escape (rechazado), path absoluto fuera del workspace (rechazado), path con caracteres de control (rechazado)."
  - "bun run validate verde."
- status: pending

### s4 — Tipar catchalls residuales en rules/get_rules y proposals/adopt
- files: plugins/rules/src/lib/tools/rules-tools.ts
- files: plugins/proposals/src/lib/tools/adopt.tool.ts
- files: plugins/rules/tests/src/lib/tools/rules-tools.spec.ts
- files: plugins/proposals/tests/src/lib/tools/adopt.tool.spec.ts
- gate: lint
- acceptance:
  - "rules-tools.ts:199 — reemplazar z.object({}).catchall(z.unknown()) en get_rules.areas[].rules por z.record(z.string(), z.unknown()) para preservar la presencia de keys sin perder el modelado."
  - "adopt.tool.ts:81 — reemplazar el catchall de layout por z.object({ proposalsDir: z.string(), proposalIndexFile: z.string() }) casando con IHostPathLayout."
  - "Specs actualizados con casos golden que verifiquen el shape exacto tras el cambio."
  - "bun run types:generate ejecutado sin warnings de catchall restantes en estos dos plugins."
  - "bun run validate verde."
- status: pending

### s5 — Audit brief — añadir mcp-vertex_metrics, keepLegacy, tool-outputs como invariantes
- files: plugins/audit/src/lib/brief.ts
- files: plugins/audit/tests/src/lib/brief.spec.ts
- gate: lint
- acceptance:
  - "El brief de auditoría menciona explícitamente mcp-vertex_metrics como la primitiva de observabilidad que toda auditoría debe verificar (presencia, persistencia, snapshot diff)."
  - "El brief añade un bullet sobre keepLegacy: 'los plugins deben honrar o ignorar explícitamente ctx.keepLegacy'."
  - "El brief añade un bullet sobre tool-outputs.ts: 'los plugins con typed outputSchema deben tener su tool-outputs.ts generado y commiteado'."
  - "Spec nuevo que verifica que el brief contiene las 3 menciones."
  - "bun run validate verde."
- status: pending

### s6 — Generar tool-outputs para audit, status-marker, test-convention
- files: plugins/audit/src/generated/tool-outputs.ts
- files: plugins/status-marker/src/generated/tool-outputs.ts
- files: plugins/test-convention/src/generated/tool-outputs.ts
- files: plugins/audit/scripts/generate-tool-outputs.ts
- files: plugins/status-marker/scripts/generate-tool-outputs.ts
- files: plugins/test-convention/scripts/generate-tool-outputs.ts
- gate: lint
- acceptance:
  - "Cada uno de los 3 plugins genera su tool-outputs.ts a partir de las tools registradas, vía scripts/emit-tool-types.ts o equivalente."
  - "El barrel público de cada plugin re-exporta el tipo generado."
  - "bun run types:generate ejecutado sin warnings."
  - "bun run validate verde."
- status: pending

### s7 — Spec de no-regresión: 0 *Sync en hot paths + 0 catchalls + 0 writeFile crudo
- files: packages/core/tests/src/lib/plugin-drift-budget.spec.ts
- gate: lint
- acceptance:
  - "Spec nuevo que ejecuta `grep -rE 'existsSync|readFileSync|readdirSync|mkdirSync|writeFileSync' plugins/*/src/ --include='*.ts' | grep -v spec.ts | grep -v test.ts` en CI y falla si encuentra hits fuera de los allowlist explícitos (boot-time en core/primitives)."
  - "Spec que ejecuta `grep -rE 'catchall\(z\.unknown' plugins/*/src/ packages/core/src` y falla si encuentra hits."
  - "Spec que ejecuta `grep -rE 'await writeFile\(' plugins/*/src/` y falla si encuentra hits (debe ser writeFileAtomic)."
  - "Los 3 specs son parte de `bun run validate`."
- status: pending

## Why

- Las propuestas puntuales `f122` (race en `sync-proposal-registry.ts:331`), `f123` (sync I/O en `notification/watcher.ts`), `l118` y `l122` (catchalls residuales) cierran **un hallazgo cada una** pero dejan sin tocar:
  1. **Sync I/O en `loop-detector-service.ts`** — el segundo hot path con `*Sync` en producción, llamado por `continue-proposal` y por el detector de loops.
  2. **Escritura no atómica en `rules/frameworks/manifest.ts`** — rompe AGENTS.md invariante 4 (durable writes via primitives).
  3. **Path input sin contain en `audit/consolidate-tool.ts`** — rompe AGENTS.md invariante 5 (workspace-scoped path inputs via `resolveWorkspaceContained`).
  4. **Catchalls residuales** en `rules/get_rules.areas[].rules` y `proposals/adopt.layout` (los otros catchalls están cubiertos por l118/l122).
  5. **Audit brief desactualizado** — no menciona `mcp-vertex_metrics`, ni `keepLegacy`, ni el invariante "tool-outputs commiteado".
  6. **`tool-outputs.ts` ausente** en `audit`, `status-marker`, `test-convention` — el SDK tipado no cubre esos plugins.
- Sin un cierre consolidado, cada nuevo plugin que se sume al swarm arrastrará las mismas dudas: ¿dónde está `walkAllowedFiles`? ¿cómo tipas un outputSchema abierto? ¿qué hace `keepLegacy`? El brief de auditoría debe **codificar** las respuestas.
- AGENTS.md regla 9 (i18n) es completa en `apps/web` y `apps/vscode`, pero los plugins no tienen i18n. Esta propuesta **no toca i18n** porque ya está cubierta por f110 (i18n completeness en apps). Queda fuera de scope.

## Non-goals

- Reescribir el loop-detector completo (el refactor es local a las 5–6 llamadas síncronas).
- Cambiar la API pública de las tools (los nombres y shapes quedan idénticos; solo cambia el código interno).
- Añadir un nuevo mecanismo de locking distribuido (`withFileMutex` es suficiente).
- Internacionalizar los strings de los plugins (cubierto por f110).
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

- **Auditoría origen**: `a022-21-06-2026-copilot-minimax-m3-repositorio.md` (P0/P1/P2 agregados como F-02..F-12 complementarios).
- **Propuestas relacionadas** (no se solapan):
  - `f122` — race en `sync-proposal-registry.ts:331` (cerrado por separado).
  - `f123` — sync I/O en `notification/watcher.ts` (cerrado por separado).
  - `l118` / `l122` — catchalls en bootstrap/scaffold + JSDoc de primitivas sync (cubren el core, no los plugins).
  - `l121` — depth extension (search rg, memory export/import, docs_search; **distinto objetivo**).
  - `x123` — fix de zombie host (no relacionado).
- **Primitivas del core usadas**: `writeFileAtomic`, `withFileMutex`, `resolveWorkspaceContained`, `redactSecrets`, `walkAllowedFiles` (todas del barrel `@mcp-vertex/core/public`).
- **Relación con `mcp-vertex_metrics`**: el spec `s7` registra los anti-patrones en cada test; `mcp-vertex_metrics` (M29) los observará en producción tras el primer release post-merge.
- **Tamaño estimado del cambio**: 7 slices, 8 archivos de producción + 5 specs nuevos. Cada slice es ≤ 1 día; el total es ≈ 4 días de trabajo.
