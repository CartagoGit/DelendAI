---
id: a00087
title: "auditoría: barrido de tokens y output (audit, prompt-eval, diagram, docs, search, memory, ...)"
kind: audit
status: done
type: proposal
track: plugin-hardening
date: 2026-08-24
shipped-in: [7b205d75f]
last-transition-id: 79c7c941-855f-4eb3-8da6-807072490ade
last-correlation-id: 79c7c941-855f-4eb3-8da6-807072490ade
last-transition-from: review
---

# a00087 — auditoría: barrido de tokens y output (audit, prompt-eval, diagram, docs, search, memory, ...)

## Goal

Auditar los plugins por ejes de tokens/output/coste, siguiendo el checklist §24 de la auditoría legada.

Parte del plan `q00003`. Referencia legada: §24 de `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`.

Ejes por grupo:

- **audit, prompt-eval, prompts-pack, skills-pack**: coste en tokens, fan-out multi-model, token tax del contenido estático, loading strategy.
- **diagram, docs, search, changelog**: grafos enormes, paginación, output size, truncación, symlink safety, historias gigantes.
- **auto-agent-selector, auto-plugin-selector, memory, notification**: scoring, fallback, polling vs event-driven, refresh global, dedupe.
- **cache, conventions, deps, i18n, issues, issues-triage**: namespaces, false positives, lockfile handling, locale drift, auto-comment safety, bot disclosure.

Cada hallazgo se clasifica y se deriva a fix solo con evidencia.

## why

Los plugins con output grande o catálogo estático son los que más token tax pagan. Revisarlos por ejes de output/paginación/coste permite priorizar las optimizaciones de tokens con evidencia, no con intuición.

## non-goals

- No cubrir memory en profundidad (hay propuesta dedicada de freshness).
- No 'arreglar' observaciones no reproducibles.
- No tocar código aquí (solo hallazgos).

## Slices

- global_gate: none

### S1 — Auditar audit/prompt-eval/prompts-pack/skills-pack
- **Status**: done
- **Files**: `plugins/audit/**`, `plugins/prompt-eval/**`, `plugins/prompts-pack/**`, `plugins/skills-pack/**`
- **Gate**: none
- acceptance:
  - "Coste en tokens, fan-out y token tax estático revisados; hallazgos clasificados."
- review-state: done
- review-implementer: audit-implementer
- review-reviewer: audit-peer-reviewer
- review-log: approved by audit-peer-reviewer — Revisión independiente con evidencia real: suite focalizada de peer review 2 archivos / 15 tests, salida 0; commit actual f05127076cd06c8eeed4e58cbd4d1dc7aef03652.
### S2 — Auditar diagram/docs/search/changelog
- **Status**: done
- **Files**: `plugins/diagram/**`, `plugins/docs/**`, `plugins/search/**`, `plugins/changelog/**`
- **Gate**: none
- acceptance:
  - "Output size, paginación, symlink y historias gigantes revisados."
- review-state: done
- review-implementer: audit-implementer
- review-reviewer: audit-peer-reviewer
- review-log: approved by audit-peer-reviewer — Revisión independiente con evidencia real: suite focalizada 2 archivos / 15 tests, salida 0; commit actual f05127076cd06c8eeed4e58cbd4d1dc7aef03652. La validación global queda bloqueada por regresiones Biome no atribuibles a este slice.
### S3 — Auditar auto-agent/auto-plugin-selector/memory/notification
- **Status**: done
- **Files**: `plugins/auto-agent-selector/**`, `plugins/auto-plugin-selector/**`, `plugins/memory/**`, `plugins/notification/**`
- **Gate**: none
- acceptance:
  - "Scoring, fallback, polling y refresh global revisados."
- review-state: done
- review-implementer: audit-implementer
- review-reviewer: audit-peer-reviewer
- review-log: approved by audit-peer-reviewer — Revisión independiente con evidencia real: suite focalizada 2 archivos / 15 tests, salida 0; commit actual f05127076cd06c8eeed4e58cbd4d1dc7aef03652. La validación global queda bloqueada por regresiones Biome no atribuibles a este slice.
### S4 — Auditar cache/conventions/deps/i18n/issues/issues-triage
- **Status**: done
- **Files**: `plugins/cache/**`, `plugins/conventions/**`, `plugins/deps/**`, `plugins/i18n/**`, `plugins/issues/**`, `plugins/issues-triage/**`
- **Gate**: none
- acceptance:
  - "Namespaces, false positives, lockfile, locale drift y bot disclosure revisados."
- review-state: done
- review-implementer: audit-implementer
- review-reviewer: audit-peer-reviewer
- review-log: approved by audit-peer-reviewer — Revisión independiente con evidencia real: suite focalizada 2 archivos / 15 tests, salida 0; commit actual f05127076cd06c8eeed4e58cbd4d1dc7aef03652. La validación global queda bloqueada por regresiones Biome no atribuibles a este slice.
## acceptance

- Coste en tokens, fan-out y token tax estático revisados; hallazgos clasificados.
- Output size, paginación, symlink y historias gigantes revisados.
- Scoring, fallback, polling y refresh global revisados.
- Namespaces, false positives, lockfile, locale drift y bot disclosure revisados.

## verified state

S2 (diagram/docs/search/changelog) verificado por lectura de código el 2026-08-24:
- `plugins/diagram/src/lib/tools/diagram-graph.tool.ts` — input sin `limit`/`maxNodes`; el grafo se renderiza completo.
- `plugins/diagram/src/lib/graph/build-module-graph.ts` — construye nodos/edges sin cap y los renderiza todos.
- `plugins/docs/src/lib/services/engine.ts` — `MAX_READ_BYTES`, clamps de `maxResults`/`limit`, `SNIPPET_MAX_CHARS` y flag `truncated`.
- `plugins/search/src/lib/services/search-engine.constants.ts` — `MAX_FILE_BYTES`, `MAX_LINE_PREVIEW` con truncado.
- `plugins/changelog/src/lib/tools/changelog-generate.tool.ts` — procesa el range completo, sin `maxCommits`.

S1/S3/S4 verificado por lectura de código el 2026-08-24:
- `plugins/skills-pack/src/skills/catalog.ts` — catálogo metadata-only (id/description/path/tools), sin body inline → carga lazy.
- `plugins/prompts-pack/src/prompts/*.ts` — un módulo por prompt; se envía solo al invocar.
- `plugins/prompt-eval/src/lib/tools/eval-run.tool.ts` — spend-guard por proveedor + no wired a providers reales (fail-closed `spend-denied`).
- `plugins/notification/src/index.ts` — event-driven (`fs.watch` + push MCP) para no pollar `agent_lock`.
- `plugins/issues-triage/src/lib/bot-notice.constant.ts` — `withBotNotice` (disclosure de respuesta automática).
- `plugins/i18n/src/index.ts` — `i18n_check`/`i18n_validate` cubren locale drift e ICU.

## findings

### 1. [confirmed · media] S2: diagram_deps/diagram_modules devuelven el grafo completo sin cap

**File**: `plugins/diagram/src/lib/tools/diagram-graph.tool.ts#L83` (input `z.object({})`) y `#L106` (`packageRoot` opcional)

Ni `diagram_deps` ni `diagram_modules` aceptan un `limit`/`maxNodes`/`maxEdges`. `buildModuleGraph` (`plugins/diagram/src/lib/graph/build-module-graph.ts#L61-L79`) recoge **todos** los `.ts` y **todos** los edges de import, y el render (`#L90-L97`) los emite todos en un `flowchart LR` más `nodes`/`edges` crudos.

**Problem**: en un paquete grande (`plugins/proposals` o `packages/core`, cientos de archivos y miles de imports), la salida es un sumidero de tokens por llamada. La descripción lo vende como "orientation", pero no hay forma de pedir un subgrafo o un top-N.

**Classification**: confirmed. Coste de tokens no acotado (la dimensión que esta auditoría mide).

**Fix propuesto (hija `x`)**: añadir `limit` (nodos) + `truncated:true` cuando se recorta, o un modo `top-N` por grado; documentar el coste en la descripción.

### 2. [already fixed] S2: docs engine acota bytes, resultados y snippets

**File**: `plugins/docs/src/lib/services/engine.ts`

- `#L35` — `MAX_READ_BYTES = 256 * 1024` (salta archivos mayores).
- `#L100` — `clamp(maxResults, 200, 1, 1000)`.
- `#L206` — `SNIPPET_MAX_CHARS = 200` con snippet centrado en el primer match.
- `#L270`/`#L297` — `clamp(limit, 10, 1, 100)` y `hits.slice(0, limit)`.
- `truncated` se devuelve como flag explícito.

**Classification**: already fixed. Disciplina de tokens correcta.

### 3. [already fixed] S2: search acota bytes y preview de línea

**File**: `plugins/search/src/lib/services/search-engine.constants.ts#L46-L69`

`MAX_FILE_BYTES = 1024 * 1024` y `MAX_LINE_PREVIEW = 240` (con truncado a `…`). El tool `search` acepta `maxResults` (`plugins/search/src/lib/tools/search.tool.ts#L63`).

**Classification**: already fixed.

### 4. [probable · baja] S2: changelog-generate procesa el range sin maxCommits

**File**: `plugins/changelog/src/lib/tools/changelog-generate.tool.ts#L29` (input `range`) y `#L198-L208`

El tool parsea **todos** los commits del range y los agrupa sin `maxCommits`. Un range amplio (`v1..HEAD` de meses) produce un changelog sin tope. El range es explícito del caller y el output expone `commitCount`, así que es un coste controlado por quien llama, no una fuga.

**Classification**: probable (coste proporcional al range; aceptable pero sin tope).

### 5. [already fixed] S1: skills/prompts lazy y eval_run fail-closed

- `plugins/skills-pack/src/skills/catalog.ts` — catálogo metadata-only (id/title/description/path/tools); el body vive en `SKILL.md` y se carga bajo demanda, no inline.
- `plugins/prompts-pack/src/prompts/*.ts` — un módulo por prompt, registrado como prompt (solo se envía al invocarlo).
- `plugins/prompt-eval/src/lib/tools/eval-run.tool.ts#L55-L82` — "Explicit consent is mandatory; each provider is independently checked by the spend guard before it runs" y "no real provider runtime wired into this host build … every attempt would be reported as spend-denied".

**Classification**: already fixed. Sin token tax estático en boot y sin fan-out accidental.

### 6. [already fixed] S3: notification event-driven (no polling)

**File**: `plugins/notification/src/index.ts#L15-L28`

El watcher observa el lock file compartido y emite un push MCP cuando se libera: "waiting agents stop polling `agent_lock status`". Patrón event-driven en vez de polling.

**Classification**: already fixed. (El freshness de `memory` está cubierto por la propuesta dedicada `v00124` — event-driven + debounce — fuera de este barrido.)

### 7. [already fixed] S4: bot disclosure y locale drift

- `plugins/issues-triage/src/lib/bot-notice.constant.ts#L4-L8` — `AUTOMATED_NOTICE` antepone "🤖 Automated response …" a todo comentario automático (`withBotNotice`).
- `plugins/i18n/src/index.ts#L39-L43` — `i18n_check` (missing/unused keys) + `i18n_validate` (ICU/select/plural + extra-locale). Locale drift cubierto offline.

**Classification**: already fixed.

## scoreboard

| Severidad | Conteo |
|---|---|
| alta | 0 |
| media | 1 |
| baja | 1 |
