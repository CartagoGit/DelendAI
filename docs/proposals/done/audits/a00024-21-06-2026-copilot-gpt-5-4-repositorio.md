---
id: a00024
kind: audit
title: "Auditoría completa del repositorio — GitHub Copilot (GPT-5.4)"
status: done
date: 2026-06-21
track: archive
ownership:
  - { agent: implementation_runner, task: 'S1: Execute audit and document findings' }
acceptance:
  - { command: bun run lint:proposals, expect: exit0 }
  - { command: bun run validate, expect: exit0 }
---

# a00024 — Auditoría completa del repositorio — GitHub Copilot (GPT-5.4)

> **Superseded by unified audit [`a00022`](../../ready/a00022-21-06-2026-claude-code-sonnet-4-6-auditoria-unificada.md)**
> (consolidación de auditorías ready del 2026-06-21); ver a00022 para hallazgos
> referenciados y slices vivos. Cerrada como referencia histórica.

## Goal

- **Audited Scope**: Monorepo completo — `packages/core`, `packages/client`, `plugins/*`, `apps/web`, `extensions/vscode`, `scripts/*` y la capa de propuestas/auditorías bajo `docs/proposals/`.
- **Audited HEAD**: `01de303dfa0140ea1d8af3ea9ac8b91cc58ffc56` (rama `develop`).
- **Revisor / Model**: GitHub Copilot (GPT-5.4).
- **Date**: 2026-06-21.
- **Método**: revisión read-only del código, contraste de auditorías ya existentes, ejecución del gate principal (`bun run validate`) y comprobaciones focalizadas sobre empaquetado, cobertura y superficie pública.

## Why

El repositorio sigue teniendo una base técnica fuerte: arquitectura núcleo-plugin limpia, contratos relativamente explícitos y una disciplina de validación clara. Pero el estado auditado hoy no está plenamente verde: el gate principal falla en el árbol actual, el gate raíz no cubre toda la superficie que el monorepo publica, y quedan huecos de robustez operativa en reglas de persistencia, smoke de release y cobertura de UI. **Score: 8.4/10**.

## Non-goals

- Reescribir o cerrar auditorías previas de otros modelos.
- Resolver en esta misma auditoría todos los hallazgos detectados.
- Tratar como defectos del producto los cambios concurrentes del working tree sin evidencia reproducible en código o comandos.

## Slices

- global_gate: lint

### S1 — Execute audit and document findings
- **Files**: `docs/proposals/ready/a00024-21-06-2026-copilot-gpt-5-4-repositorio.md`
- **Gate**: `bun run lint:proposals`
- **Status**: pending

### S2 — Restore green validation gate in current workspace
- **Files**:
  - `apps/web/src/components/Config.astro`
  - `apps/web/src/components/PluginsSection.astro`
- **Gate**: `bun run validate`
- **Status**: pending

### S3 — Re-expand root validation coverage
- **Files**:
  - `vitest.config.ts`
  - `tsconfig.json`
- **Gate**: `bun run validate`
- **Status**: pending

### S4 — Harden durable writes in rules cache
- **Files**:
  - `plugins/rules/src/lib/frameworks/manifest.ts`
- **Gate**: `bun run validate`
- **Status**: pending

### S5 — Expand publish/install smoke coverage
- **Files**:
  - `scripts/smoke-pack.ts`
  - `plugins/audit/package.json`
- **Gate**: `bun run build && bun run smoke:pack`
- **Status**: pending

### S6 — Raise app-level resilience and UI test coverage
- **Files**:
  - `apps/web/vitest.config.ts`
  - `extensions/vscode/src/commands/show-overview.ts`
  - `extensions/vscode/src/commands/show-metrics.ts`
  - `extensions/vscode/src/commands/open-proposal.ts`
  - `extensions/vscode/src/commands/run-validation.ts`
- **Gate**: `bun run validate`
- **Status**: pending

## Acceptance

- `bun run lint:proposals` valida esta auditoría.
- `bun run validate` vuelve a estar verde para el árbol auditado.
- Los slices `S2` a `S6` se resuelven o se desglosan en propuestas dedicadas con trazabilidad explícita.

## Verified State

| Aspect | Metric / Command | Result / Count |
|---|---|---|
| Audited HEAD | `git rev-parse HEAD` | `01de303dfa0140ea1d8af3ea9ac8b91cc58ffc56` |
| Working tree | `git status --porcelain` | árbol concurrente, no limpio |
| Validation gate | `bun run validate` | **FAIL** en `bun run lint` por 1 error de Biome y 1 drift de formato en `apps/web` |
| Root test projects | `vitest.config.ts` | incluye `packages/*`, `plugins/*`, `examples/custom-plugin`, `apps/web`; **excluye `extensions/vscode`** |
| Publish smoke scope | `scripts/smoke-pack.ts` | solo prueba `packages/core`, `plugins/proposals`, `plugins/memory` |
| Web unit test scope | `apps/web/vitest.config.ts` | solo prueba `scripts/__tests__/**/*.spec.ts`; no cubre componentes/páginas Astro |
| Audit typecheck coverage | `tsconfig.json` + `scripts/build.ts` | `plugins/audit/**/*` excluido del typecheck raíz, pero sí entra en build por descubrimiento |
| Tool-output SDK exports | `plugins/*/src/public/index.ts` + `scripts/emit-tool-types.ts` | hay plugins publicables con outputSchema sin barrel de tipos generados equivalente |

## Findings

| ID | Severity | Description | Files | Resolution Track |
|---|---|---|---|---|
| H1 | P0 | El estado auditado no pasa el gate principal: `bun run validate` falla en `bun run lint` por una concatenación no conforme en `Config.astro` y drift de formato en `PluginsSection.astro`. Mientras esto siga así, la rama no cumple la definición de hecho del repo. | [apps/web/src/components/Config.astro](apps/web/src/components/Config.astro), [apps/web/src/components/PluginsSection.astro](apps/web/src/components/PluginsSection.astro) | Resolved in slice `S2` |
| H2 | P1 | El `vitest.config.ts` raíz ya no incluye `extensions/vscode`, así que la validación global deja fuera una app del monorepo. Eso reduce la fiabilidad del gate y permite regresiones en la extensión sin señal en `bun run validate`. | [vitest.config.ts](vitest.config.ts) | Resolved in slice `S3` |
| H3 | P1 | `plugins/audit` está excluido del typecheck raíz, pero `scripts/build.ts` lo descubre y lo construye como paquete publicable. El gate principal no cubre toda la superficie que el monorepo distribuye. | [tsconfig.json](tsconfig.json), [scripts/build.ts](scripts/build.ts), [plugins/audit/vitest.config.ts](plugins/audit/vitest.config.ts) | Resolved in slice `S3` |
| H4 | P1 | El caché/manifest de `rules` usa `writeFileSync` y `readFileSync` directamente para materializar presets y regenerar el manifest. En un repo explícitamente multiagente, esa persistencia no es tan robusta como las primitivas durables ya disponibles. | [plugins/rules/src/lib/frameworks/manifest.ts](plugins/rules/src/lib/frameworks/manifest.ts) | Resolved in slice `S4` |
| H5 | P2 | El smoke de empaquetado e instalación desde tarball solo cubre core, proposals y memory. El resto de plugins publicables puede romper exports, peers o `files` sin señal previa en CI. | [scripts/smoke-pack.ts](scripts/smoke-pack.ts) | Resolved in slice `S5` |
| H6 | P2 | El paquete `@mcp-vertex/audit` omite `LICENSE` en `files`, a diferencia del resto de plugins revisados. Eso degrada el artefacto publicado aunque no rompa el runtime. | [plugins/audit/package.json](plugins/audit/package.json) | Resolved in slice `S5` |
| H7 | P2 | La web solo prueba scripts utilitarios; no hay cobertura Vitest para componentes ni páginas Astro. Hoy el build detecta parte de las roturas, pero no asegura comportamiento ni render de la UI. | [apps/web/vitest.config.ts](apps/web/vitest.config.ts) | Resolved in slice `S6` |
| H8 | P2 | Varios comandos de la extensión VS Code invocan el cliente MCP sin `try/catch` ni feedback de error al usuario. Ante fallos de transporte o respuesta, el comando puede abortar sin diagnóstico visible. | [extensions/vscode/src/commands/show-overview.ts](extensions/vscode/src/commands/show-overview.ts), [extensions/vscode/src/commands/show-metrics.ts](extensions/vscode/src/commands/show-metrics.ts), [extensions/vscode/src/commands/open-proposal.ts](extensions/vscode/src/commands/open-proposal.ts), [extensions/vscode/src/commands/run-validation.ts](extensions/vscode/src/commands/run-validation.ts) | Resolved in slice `S6` |
| H9 | P3 | Hay deriva documental en la config raíz de Vitest: sigue remitiendo al patrón histórico de opt-out de audit, pero la config actual del plugin sí ejecuta sus tests. No rompe funcionalidad, pero sí confunde mantenimiento. | [vitest.config.ts](vitest.config.ts), [plugins/audit/vitest.config.ts](plugins/audit/vitest.config.ts) | Resolved in slice `S3` |

## Scoreboard

| Dimension | Score | Comments |
|---|---:|---|
| Arquitectura core | 9.3 | El núcleo sigue claramente agnóstico y bien separado de plugins. |
| Plugins | 8.4 | Superficie sana en general, pero con una brecha real de persistencia en `rules` y cobertura de release incompleta. |
| Apps | 8.0 | Web y VS Code están bien planteadas, pero el gate actual deja fuera parte de la app surface y falta cobertura de UI/resiliencia. |
| Calidad operativa | 7.8 | El repo tiene reglas buenas, pero el árbol auditado está rojo y la validación raíz no cubre todo lo que publica. |
| Release / packaging | 8.1 | Build y smoke existen, pero el smoke de tarballs es demasiado estrecho y audit empaqueta peor que el resto. |
| Documentación / propuesta | 8.8 | La disciplina documental es fuerte; persiste algo de deriva histórica en comentarios/configuración. |
| **Total (Average)** | **8.4** | **Base sólida, pero con deuda operativa concreta y verificable.** |

## Notes

- Esta auditoría sí ejecutó `bun run validate`, y el resultado del estado auditado fue rojo por cambios concurrentes presentes en `apps/web`.
- No he reescrito ni invalidado las auditorías `a00021` o `a00026`; esta propuesta es independiente y refleja el estado observado por GPT-5.4 en este turno.
- Si el árbol sigue cambiando en paralelo, el primer paso prudente antes de ejecutar `S2` a `S6` es revalidar `git status --porcelain` y reler solo los archivos objetivo de cada slice.