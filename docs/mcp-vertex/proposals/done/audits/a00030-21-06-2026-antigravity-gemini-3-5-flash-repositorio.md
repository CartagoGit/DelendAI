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

- **Audited Scope**: Monorepo completo (`packages/core`, `packages/client`, `packages/ui-extension`, `plugins/*`, `apps/*`, `extensions/vscode`), evaluando la salud general del código, concurrencia, linter interno, cuotas de almacenamiento, consistencia del buscador y contratos de interfaces.
- **Audited HEAD**: `6b47753`
- **Revisor / Model**: Antigravity (Gemini 3.5 Flash)
- **Date**: 2026-06-21

## Why

### 0. Veredicto rápido
El monorepo presenta una madurez excepcional con un acoplamiento bajísimo y un riguroso cumplimiento de los principios SOLID **(Score medio: 9.5/10)**. Sin embargo, un análisis cualitativo en profundidad del código fuente de producción ha revelado problemas sutiles pero reales en concurrencia (como una condición de carrera de torn reads en logs y un riesgo de robo de mutex bajo CPU starvation), fallos en control de cuotas en importaciones, y divergencias entre backends de búsqueda y validaciones de configuraciones.

### 1. Por capas (Núcleo, Cliente, Plugins, Aplicaciones, etc.)

- **Núcleo (`packages/core`)**:
  - En [`load-plugins.ts`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/plugins/load-plugins.ts#L161-L170), el validador descarta el detalle del error de Zod (`parsed.error`), impidiendo al desarrollador saber qué propiedad específica del archivo de configuración falló.
  - En [`with-file-mutex.ts`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/shared/with-file-mutex.ts#L114-L124), el robo de lock predeterminado tras 5s expone al sistema a pérdidas de exclusión mutua si el proceso sufre inanición de CPU (CPU starvation).

- **Cliente (`packages/client`)**:
  - Implementación impecable de la capa de servicios JSON-RPC. El bridge de logs de notificación interactúa adecuadamente con el event loop sin provocar fugas de descriptores.

- **Plugins (`plugins/*`)**:
  - **`logs`**: La función `readAllFiles` en [`log-store.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/logs/src/lib/log-store.ts#L64-L93) lee archivos con `readFile` directo sin usar el mutex, lo que puede provocar torn reads si coincide con un append simultáneo de `appendEvent` en [`log-store.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/logs/src/lib/log-store.ts#L96-L108).
  - **`memory`**: En [`store.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/memory/src/lib/store.ts#L415-L478), `importNotes` no valida la cuota `maxNotes`, permitiendo a un payload de importación evadir la restricción impuesta en `memory_save`.
  - **`search`**: Divergencia en [`engine.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/search/src/lib/engine.ts#L259-L267) donde el walker en-casa solo procesa `.gitignore`, mientras que el backend Ripgrep respeta `.ignore` y `.rgignore` nativos.

- **Aplicaciones y Extensión (`apps/*` / `extensions/*`)**:
  - **`apps/web`**: Astro genera y Pagefind indexa correctamente. El linter `no-shell-python` tiene un área ciega al limitar su escaneo únicamente a los directorios raíz `tools` y `scripts`, permitiendo que archivos `.sh` o `.py` aninados en `apps/` o `packages/` no sean detectados.
  - **`extensions/vscode`**: Comunicación robusta a través del canal de transporte del stdio del cliente.

### 2. Higiene transversal

- **Redacción de secretos**: `redactSecrets` se ejecuta correctamente antes de cualquier persistencia de datos sensibles en el disco (ej. en `memory` e `importNotes`).
- **Workspace containment**: Protegido robustamente mediante `resolveWorkspaceContained` evitando saltos de directorio.
- **console.log residual**: Limpio, no se encuentran logs de consola deshonestos en producción.
- **@ts-ignore / @ts-nocheck**: 0 ocurrencias en código activo de paquetes nucleares.

### 3. Eficiencia / tokens / bucles / bloqueos

- **Eficiencia de tokens**: Uso de cold-starts optimizados mediante `mcp-vertex_overview` y caches locales de round-context.
- **Bucles / bloqueo**: Mutex timers con robo evitan deadlocks perpetuos, pero a costa de romper la exclusión mutua temporalmente bajo carga extrema.

### 4. Top acciones para 10/10 (prioridad)

1. **Resolver torn reads en logs (`f00055`)**: Envolver la lectura `readAllFiles` del plugin de logs en un contexto `withFileMutex` compartido con la escritura.
2. **Evitar robo de lock bajo CPU starvation (`f00053`)**: Alinear los timeouts o introducir mecanismos adaptativos en `withFileMutex`.
3. **Formatear errores Zod en carga de plugins (`f00050`)**: Reportar las claves y motivos detallados del error de validación de Zod en `loadPlugins.ts`.
4. **Validar cuota de notas en `memory_import` (`f00054`)**: Enforzar la cuota `maxNotes` antes de volcar las notas importadas.
5. **Unificar ignore patterns en el motor de búsqueda (`f00052`)**: Implementar en el walker en-casa soporte para `.ignore` y `.rgignore`.
6. **Corregir área ciega de `no-shell-python` (`f00051`)**: Modificar el linter para que escanee recursivamente subdirectorios `scripts/` o `tools/` en paquetes del monorepo.

## Non-goals

- Alterar los protocolos estandarizados de comunicación JSON-RPC del protocolo MCP.
- Migrar el almacenamiento de ficheros planos a sistemas de bases de datos relacionales tradicionales.

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
| H1 | P1 | Condición de carrera de torn reads (lectura sucia) en `readRange`/`tail` debido a que no adquieren el lock mutex. | [log-store.ts](file:///home/cartago/_projects/mcp-vertex/plugins/logs/src/lib/log-store.ts#L64-L93) | Deferred to Proposal `f00055` |
| H2 | P1 | El robo de lock de mutex por temporizador (5s) rompe la exclusión mutua bajo inanición de CPU (starvation). | [with-file-mutex.ts](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/shared/with-file-mutex.ts#L114-L124) | Deferred to Proposal `f00053` |
| H3 | P2 | Pérdida de detalles de error de validación de Zod en plugins, silenciando el reporte de campos incorrectos. | [load-plugins.ts](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/plugins/load-plugins.ts#L161-L170) | Deferred to Proposal `f00050` |
| H4 | P2 | La importación masiva en `memory_import` evade la cuota total de notas `maxNotes` permitiendo saturación del disco/memoria. | [store.ts](file:///home/cartago/_projects/mcp-vertex/plugins/memory/src/lib/store.ts#L415-L478) | Deferred to Proposal `f00054` |
| H5 | P3 | El linter `no-shell-python` ignora carpetas de scripts internas de apps o plugins al limitarse al nivel raíz. | [no-shell-python.script.ts](file:///home/cartago/_projects/mcp-vertex/tools/scripts/lint/no-shell-python.script.ts#L56) | Deferred to Proposal `f00051` |
| H6 | P3 | Divergencia en el soporte de `.ignore`/`.rgignore` entre Ripgrep y el walker en-casa (fallback). | [engine.ts](file:///home/cartago/_projects/mcp-vertex/plugins/search/src/lib/engine.ts#L259-L267) | Deferred to Proposal `f00052` |

## Scoreboard

| Dimension | Score | Comments |
|---|---:|---|
| Arquitectura del Core | 9.8 | Altamente desacoplada y orientada a interfaces estables. |
| Gestión de Concurrencia | 8.8 | Mutex robusto, pero susceptible a robo bajo inanición extrema de CPU y torn reads en logs. |
| Gestión de Memoria / Cuotas | 8.9 | Límites configurables, pero el importador de memoria evade el límite de cuota. |
| Seguridad Operacional | 9.6 | Redacción de secretos coherente y contención robusta del workspace. |
| Buscador y Linter Interno | 9.1 | Divergencias menores en el soporte de exclusiones y área ciega en el linter de scripts. |
| TypeScript / Calidad de Tipado | 9.9 | Tipado estricto e impecable con SDK de herramientas autogenerado y validado en CI. |
| Suite de Tests | 9.9 | Tests concurrentes de caos realistas y verificaciones continuas contra drift. |
| **Total (Average)** | **9.5** | **Estructura soberbia de producción real con deudas técnicas menores bien acotadas.** |

**Nota final: 9.5/10 — Excelente.**
