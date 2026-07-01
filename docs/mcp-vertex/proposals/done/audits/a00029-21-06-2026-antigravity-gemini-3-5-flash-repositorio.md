---
id: a00029
kind: audit
title: "Auditoría exhaustiva del repositorio — Antigravity (Gemini 3.5 Flash)"
status: done
date: 2026-06-21
track: archive
ownership:
  - { agent: implementation_runner, task: 'S1: Execute audit and document findings' }
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run site:strict, expect: exit0 }
---

# a00029 — Auditoría exhaustiva del repositorio — Antigravity (Gemini 3.5 Flash)

## Goal

- **Audited Scope**: Monorepo completo (`packages/core`, `packages/client`, `plugins/*`, `apps/*`, `extensions/vscode`), evaluando la salud del código, conformidad con `AGENTS.md`, concurrencia, cuotas de almacenamiento y compilación estricta del entorno web.
- **Audited HEAD**: `31e8da2` + cambios locales (HEAD final tras aplicar los fixes `S2` a `S5`).
- **Revisor / Model**: Antigravity (Gemini 3.5 Flash)
- **Date**: 2026-06-21

## Why

### 0. Veredicto rápido
El estado general del repositorio es **excelente (Score medio: 9.6/10)**, mostrando un desacoplamiento riguroso entre el motor y los plugins de comportamiento del dominio. Sin embargo, una revisión en profundidad más allá de los scripts automatizados de validación ha revelado varios bugs de lógica y posibles fallos de concurrencia/cuotas en producción. En particular, se ha corregido un bug crítico en el analizador de dependencias políglotas (`polyglot.ts`) que ignoraba por completo las dependencias de Python declaradas en arrays multi-línea en `pyproject.toml`, un bug de resolución de rutas en el linter de scaffolds, y la omisión de una exportación del núcleo que impedía el arranque del host server en E2E. Adicionalmente, se han detectado y documentado riesgos de exclusión mutua por robo prematuro de locks bajo alta carga y la evasión de la cuota de memoria al importar notas.

### 1. Por capas (Núcleo, Cliente, Plugins, Aplicaciones, etc.)
- **Núcleo (`packages/core`)**: Presenta un diseño agnóstico impecable. El registro de herramientas (`createMcpProject`) está desacoplado de las dependencias externas. Sin embargo, requería exponer `hasExplicitPluginSurfaceSelection` en su barril público (`public/index.ts`) para evitar fallos de compilación en scripts del host server.
- **Cliente (`packages/client`)**: Excelente estructuración del cliente de stdio y mapeo de servicios de interfaz (`DashboardService`, `OverviewService`).
- **Plugins (`plugins/*`)**: Se auditaron con detalle varios plugins.
  - *Proposals*: El detector de bucles (`agent-loop-detector.ts`) funciona correctamente con tests unitarios robustos, aunque el lock mutex compartido tiene riesgos concurrentes de robo (ver hallazgo H5).
  - *Deps*: Se detectó que el analizador de TOML (`splitTomlTables`) estaba roto para arrays multi-línea (PEP 621), asumiendo erróneamente que los arrays siempre se declaran en una sola línea. Se ha corregido y validado con tests.
  - *Memory*: El almacén de memoria (`store.ts`) tiene un robusto control de escritura atómica con mutex y sanitización de secretos, pero carece de validación de cuota máxima de notas al importar un volcado JSON/NDJSON (ver hallazgo H6).
- **Aplicaciones y Extensión (`apps/*` / `extensions/*`)**: La aplicación web de Astro compila limpiamente (`astro build`). Pagefind indexa únicamente la etiqueta `data-pagefind-body` en `Base.astro`. La extensión de VS Code encapsula correctamente los adaptadores e implementa i18n con soporte multiidioma.

### 2. Higiene transversal
- **Redacción de secretos**: Correctamente implementada mediante `redactSecrets` en core, forzada antes de escribir en los almacenes persistentes de memoria y propuestas.
- **Workspace containment**: Forzado lexicamente a través de `resolveWorkspaceContained` en todas las herramientas del core y plugins para evitar fugas de directorio (`..` o absolutas).
- **console.log residual**: 0 ocurrencias detectadas en código de producción.
- **@ts-ignore / @ts-nocheck**: 0 ocurrencias en código de producción (fuera de fixtures de test).

### 3. Eficiencia / tokens / bucles / bloqueos
- **Eficiencia de tokens**: Muy optimizada mediante la carga perezosa de la documentación y los resúmenes de herramientas compactas en `mcp-vertex_overview`.
- **Bloqueos concurrentes**: El advisory lock en `withFileMutex.ts` usa una clave UUID y refresco de latido (`setInterval` con `utimes`) para evitar deadlocks por caída de procesos. Sin embargo, bajo CPU saturada, el timeout de contención de 5 segundos es demasiado agresivo y provocará robo de locks activos, rompiendo la exclusión mutua de escritura.

### 4. Top acciones para 10/10 (prioridad)
1. **Corregir robo prematuro de locks**: Incrementar el `timeoutMs` por defecto de `withFileMutex` o deshabilitar el robo automático si el latido (mtime) sigue actualizándose activamente en los últimos segundos. (Diferido a Propuesta `f00035`).
2. **Validar cuota en importaciones de memoria**: Modificar `importNotes` para validar que el tamaño final de la base de datos de notas no exceda `maxNotes`, truncando o rechazando la importación. (Diferido a Propuesta `f00036`).

## Non-goals

- Re-escribir el parser general de TOML de forma pesada (se opta por una acumulación básica de arrays entre corchetes `[...]` en `splitTomlTables` que soluciona el problema de manera ligera).
- Modificar el sistema de notificaciones/correlación de logs fuera del scope de esta auditoría.

## Slices

- global_gate: lint

### S1 — Execute audit and document findings
- **Files**: [a00029-21-06-2026-antigravity-gemini-3-5-flash-repositorio.md](file:///home/cartago/_projects/mcp-vertex/docs/proposals/done/audits/a00029-21-06-2026-antigravity-gemini-3-5-flash-repositorio.md)
- **Gate**: bun run lint:proposals
- **Status**: done

### S2 — Export hasExplicitPluginSurfaceSelection in packages/core/src/public/index.ts
- **Files**: [packages/core/src/public/index.ts](file:///home/cartago/_projects/mcp-vertex/packages/core/src/public/index.ts)
- **Gate**: bun run validate
- **Status**: done

### S3 — Fix scaffolds linter path resolution in tools/scripts/lint/scaffolds.script.ts
- **Files**: [tools/scripts/lint/scaffolds.script.ts](file:///home/cartago/_projects/mcp-vertex/tools/scripts/lint/scaffolds.script.ts)
- **Gate**: bun run lint:scaffolds
- **Status**: done

### S4 — Enrich audit scaffold documentation in docs/scaffolds/ARCHITECTURE-AUDITS.md
- **Files**: [docs/scaffolds/ARCHITECTURE-AUDITS.md](file:///home/cartago/_projects/mcp-vertex/docs/scaffolds/ARCHITECTURE-AUDITS.md)
- **Gate**: bun run lint:scaffolds
- **Status**: done

### S5 — Fix Python multi-line dependencies in deps_polyglot
- **Files**: [plugins/deps/src/lib/polyglot.ts](file:///home/cartago/_projects/mcp-vertex/plugins/deps/src/lib/polyglot.ts), [plugins/deps/tests/src/lib/deps.spec.ts](file:///home/cartago/_projects/mcp-vertex/plugins/deps/tests/src/lib/deps.spec.ts)
- **Gate**: bun test plugins/deps
- **Status**: done

## Acceptance

- `bun run validate` es completamente verde (código de salida 0).
- `bun run site:strict` construye sin errores y Pagefind indexa solo el contenido marcado con `data-pagefind-body`.
- Todos los slices `S2`–`S5` están implementados y verificados.
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
| H1 | P2 | Falta de exportación pública de `hasExplicitPluginSurfaceSelection` en el core | [index.ts](file:///home/cartago/_projects/mcp-vertex/packages/core/src/public/index.ts) | **Resolved in this session (S2)**. Exportado en index.ts. |
| H2 | P2 | Bug de resolución de `repoRoot` en el linter de scaffolds | [scaffolds.script.ts](file:///home/cartago/_projects/mcp-vertex/tools/scripts/lint/scaffolds.script.ts) | **Resolved in this session (S3)**. Ajustado URL path. |
| H3 | P3 | Plantilla de auditorías simplificada en scaffolds | [ARCHITECTURE-AUDITS.md](file:///home/cartago/_projects/mcp-vertex/docs/scaffolds/ARCHITECTURE-AUDITS.md) | **Resolved in this session (S4)**. Enriquecida con subsecciones H3. |
| H4 | P2 | El splitter de TOML políglota ignora dependencias multi-línea en `pyproject.toml` | [polyglot.ts](file:///home/cartago/_projects/mcp-vertex/plugins/deps/src/lib/polyglot.ts) | **Resolved in this session (S5)**. Añadida acumulación de arrays. |
| H5 | P1 | Posibilidad de colisiones de escritura si un lock de `withFileMutex` es robado prematuramente bajo carga pesada | [with-file-mutex.ts](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/shared/with-file-mutex.ts) | Deferred to Proposal `f00035` |
| H6 | P2 | `memory_import` no enforza el límite `maxNotes` al importar volcados de notas | [store.ts](file:///home/cartago/_projects/mcp-vertex/plugins/memory/src/lib/store.ts) | Deferred to Proposal `f00036` |

## Scoreboard

| Dimension | Score | Comments |
|---|---:|---|
| Arquitectura | 9.8 | Desacoplamiento impecable entre núcleo y plugins de dominio. |
| Contratos e interfaces | 9.8 | Estructuración robusta de contratos y firmas. |
| Eficiencia de tokens | 9.5 | Carga selectiva de logs y compacción de la información para evitar sobrecoste. |
| Anti-deadlock / concurrencia | 9.2 | Primitivas correctas, pero con riesgo de exclusión rota si ocurre robo prematuro. |
| Calidad de código fuente | 9.9 | Formato estricto bajo Biome, sin warnings TypeScript o de formato. |
| Documentación | 9.8 | Plantillas claras, glosario completo e i18n para 12 lenguajes. |
| Tests (estructura, cobertura, calidad) | 9.9 | Cobertura excelente con pruebas concurrentes de caos. |
| Seguridad operacional | 9.7 | Limpieza de secretos en memoria persistente e I/O contenido en workspace. |
| Genericidad (project-agnostic) | 9.6 | Lógica y enums completamente parametrizables por el host o config. |
| **Total (Average)** | **9.7** | **Excelente madurez del monorepo, robusto y preparado para swarms.** |

**Nota final: 9.7/10 — Calidad sobresaliente.**
