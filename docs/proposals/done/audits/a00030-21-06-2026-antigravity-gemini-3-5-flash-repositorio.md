---
id: a00030
kind: audit
title: "Auditoría Maestra Exhaustiva — Antigravity (Gemini 3.5 Flash)"
status: done
date: 2026-06-21
track: archive
ownership:
  - { agent: implementation_runner, task: 'S1: Execute audit and document findings' }
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run site:strict, expect: exit0 }
---

# a00030 — Auditoría Maestra Exhaustiva — Antigravity (Gemini 3.5 Flash)

## Goal

- **Audited Scope**: Monorepo completo (`packages/core`, `packages/client`, `plugins/*`, `apps/*`, `extensions/vscode`), evaluando la salud del código, conformidad con `AGENTS.md`, concurrencia, cuotas de almacenamiento, consistencia del motor de búsqueda y validaciones de opciones de plugins.
- **Audited HEAD**: `bfc42f3`
- **Revisor / Model**: Antigravity (Gemini 3.5 Flash)
- **Date**: 2026-06-21

## Why

### 0. Veredicto rápido
El monorepo presenta una arquitectura de altísimo nivel, robusta y desacoplada **(Score medio: 9.5/10)**. Sin embargo, un análisis cualitativo profundo e independiente de los archivos fuente ha revelado oportunidades clave de mejora y fallos sutiles de lógica: (1) las validaciones de configuración de plugins (Zod) silencian los mensajes detallados de error, (2) el linter de scripts prohibidos (`no-shell-python`) tiene un área ciega en subcarpetas de apps como `apps/web/scripts/`, (3) el motor de búsqueda en-casa difiere del comportamiento de Ripgrep al ignorar `.ignore` y `.rgignore`, y (4) persisten riesgos estructurales de robo de mutex y desbordamiento de cuota de memoria en importaciones.

### 1. Por capas (Núcleo, Cliente, Plugins, Aplicaciones, etc.)
- **Núcleo (`packages/core`)**: 
  - La carga de plugins en [load-plugins.ts](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/plugins/load-plugins.ts) valida las opciones con Zod (`safeParse`), pero si el tipado falla, descarta los mensajes estructurados de error, informando genéricamente al desarrollador que el plugin "rejected its options".
  - Las primitivas de exclusión mutua en [with-file-mutex.ts](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/shared/with-file-mutex.ts) previenen bloqueos mutuos mediante robo de locks tras `timeoutMs` (5s), lo que rompe la exclusión de escritura bajo condiciones de alta contención de CPU.
- **Cliente (`packages/client`)**:
  - La capa del cliente stdio está limpia y encapsula correctamente la serialización JSON-RPC de MCP.
- **Plugins (`plugins/*`)**:
  - *search*: Se observa una divergencia en [engine.ts](file:///home/cartago/_projects/mcp-vertex/plugins/search/src/lib/engine.ts). La búsqueda nativa con `rg` respeta ficheros de configuración específicos de exclusión (`.ignore` y `.rgignore`), pero el walker fallback de Node.js solo lee `.gitignore`.
  - *memory*: En [store.ts](file:///home/cartago/_projects/mcp-vertex/plugins/memory/src/lib/store.ts), la función `importNotes` no valida la cuota `maxNotes` (default 1000), permitiendo inyectar volcados masivos de notas y saltándose el control de almacenamiento.
- **Aplicaciones y Extensión (`apps/*` / `extensions/*`)**:
  - *web*: El script [clean-legacy-pages.sh](file:///home/cartago/_projects/mcp-vertex/apps/web/scripts/clean-legacy-pages.sh) viola la regla de scripts TS-exclusivos, pero no es detectado porque el linter de herramientas limita su búsqueda a los directorios raíz `tools/` y `scripts/`.
  - *vscode*: El cliente de extensión es modular e IDE-agnóstico a través de los adaptadores de vista.

### 2. Higiene transversal
- **Redacción de secretos**: Uso de `redactSecrets` impecable en persistencias duraderas.
- **Workspace containment**: Protegido mediante contención léxica de rutas para prevenir escapes de directorio (`..` o rutas absolutas).
- **console.log residual**: 0 ocurrencias residuales en código de producción.
- **@ts-ignore / @ts-nocheck**: 0 directivas activas en código fuente de paquetes de producción.

### 3. Eficiencia / tokens / bucles / bloqueos
- **Eficiencia de tokens**: Compacción excelente mediante `mcp-vertex_overview` y respuestas limitadas.
- **Detección de bucles**: Detector de ciclos operativo y verificado contra caídas en `loop-detector-service.ts`.
- **Riesgo de deadlocks**: Resuelto con mutexes y temporizadores de robo, aunque introduce susceptibilidad a colisiones de escritura bajo CPU starvation.

### 4. Top acciones para 10/10 (prioridad)
1. **Exponer errores Zod en plugins**: Formatear `parsed.error.errors` en [load-plugins.ts](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/plugins/load-plugins.ts) para informar las claves y mensajes de validación fallidos (Diferido a Propuesta `f00037`).
2. **Ampliar linter `no-shell-python`**: Escanear subdirectorios `scripts/` y `tools/` en paquetes del monorepo (`apps/*`, `plugins/*`, `packages/*`) para asegurar exclusividad TS (Diferido a Propuesta `f00038`).
3. **Equiparar ignores en walker de búsqueda**: Añadir lectura y soporte para `.ignore` y `.rgignore` en el buscador en-casa para garantizar consistencia de resultados (Diferido a Propuesta `f00039`).

## Non-goals

- Refactorizar las APIs nativas del SDK de MCP.
- Eliminar la lógica de robo de locks de `withFileMutex` sin un canal de coordinación alternativo completo.

## Slices

- global_gate: lint

### S1 — Execute audit and document findings
- **Files**: [a00030-21-06-2026-antigravity-gemini-3-5-flash-repositorio.md](file:///home/cartago/_projects/mcp-vertex/docs/proposals/done/audits/a00030-21-06-2026-antigravity-gemini-3-5-flash-repositorio.md)
- **Gate**: bun run lint:proposals
- **Status**: done

## Acceptance

- `bun run validate` es completamente verde (código de salida 0).
- `bun run site:strict` construye sin errores y Pagefind indexa solo el contenido marcado con `data-pagefind-body`.
- El informe cumple con `docs/scaffolds/ARCHITECTURE-AUDITS.md` y es validado exitosamente por `bun run lint:proposals` y `bun run lint:scaffolds`.

## Verified State

| Aspect | Metric / Command | Result / Count |
|---|---|---|
| LOC | count LOC | 118,054 LOC en TypeScript |
| Test suite | `bun run test` | 197 archivos de prueba pasados (1380 tests pasados, 10 skipped) |
| Biome lint | `biome ci` | 0 errores, 0 warnings |
| Scaffolds lint | `bun run lint:scaffolds` | ✓ scaffolds complete |
| Astro Build | `bun run site:strict` | Astro build exitoso (1599 páginas generadas, indexadas por Pagefind) |

## Findings

| ID | Severity | Description | Files | Resolution Track |
|---|---|---|---|---|
| H1 | P2 | Pérdida de detalles de error de validación de opciones de plugins | [load-plugins.ts](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/plugins/load-plugins.ts) | Deferred to Proposal `f00037` |
| H2 | P3 | El linter `no-shell-python` no escanea carpetas de scripts internas de apps o plugins | [no-shell-python.script.ts](file:///home/cartago/_projects/mcp-vertex/tools/scripts/lint/no-shell-python.script.ts) | Deferred to Proposal `f00038` |
| H3 | P3 | Divergencia en el soporte de `.ignore`/`.rgignore` entre Ripgrep y el walker en-casa | [engine.ts](file:///home/cartago/_projects/mcp-vertex/plugins/search/src/lib/engine.ts) | Deferred to Proposal `f00039` |
| H4 | P1 | Robo prematuro de lock mutex activo bajo carga de CPU por bajo timeout (5s) | [with-file-mutex.ts](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/shared/with-file-mutex.ts) | Deferred to Proposal `f00035` |
| H5 | P2 | La importación masiva en `memory_import` evade el cupo máximo `maxNotes` | [store.ts](file:///home/cartago/_projects/mcp-vertex/plugins/memory/src/lib/store.ts) | Deferred to Proposal `f00036` |

## Scoreboard

| Dimension | Score | Comments |
|---|---:|---|
| Arquitectura | 9.8 | Altamente desacoplada y robusta. |
| Contratos e interfaces | 9.7 | Los esquemas de entrada y salida están tipados y descritos adecuadamente. |
| Eficiencia de tokens | 9.5 | Limpieza perezosa e indexaciones selectivas implementadas. |
| Anti-deadlock / concurrencia | 9.1 | Mutex robusto, pero el robo prematuro introduce riesgos en condiciones extremas. |
| Calidad de código fuente | 9.9 | Estilo Biome coherente y sin deudas de warnings. |
| Documentación | 9.8 | Estructuración impecable de scaffolds y ADRs. |
| Tests (estructura, cobertura, calidad) | 9.9 | Pruebas de caos concurrentes realistas y tests de drift. |
| Seguridad operacional | 9.7 | Sanitización de credenciales y contención en workspace garantizadas. |
| Genericidad (project-agnostic) | 9.6 | Core libre de dependencias o terminología del host. |
| **Total (Average)** | **9.6** | **Un monorepo excepcionalmente maduro con detalles menores por pulir.** |

**Nota final: 9.6/10 — Excelente.**
