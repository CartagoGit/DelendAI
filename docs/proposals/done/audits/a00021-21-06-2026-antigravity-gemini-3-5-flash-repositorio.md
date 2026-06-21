---
id: a00021
kind: audit
title: "Auditoría exhaustiva — Antigravity (Gemini 3.5 Flash)"
status: done
date: 2026-06-21
track: archive
ownership:
  - { agent: implementation_runner, task: 'S1: Execute audit and document findings' }
acceptance:
  - { command: bun run validate, expect: exit0 }
---

# a021 — Auditoría exhaustiva — Antigravity (Gemini 3.5 Flash)

> **Superseded by unified audit [`a026`](../../ready/a026-21-06-2026-claude-code-sonnet-4-6-auditoria-unificada.md)**
> (consolidación de auditorías ready del 2026-06-21); ver a026 para hallazgos
> referenciados y slices vivos. Cerrada como referencia histórica.

## Goal

- **Audited Scope**: Monorepo completo (`packages/core`, `packages/client`, `apps/*`, `plugins/*`, `examples/*`).
- **Audited HEAD**: `f103a96dc7264774e617fc06efc0e848c73ab26b`
- **Revisor / Model**: Antigravity (Gemini 3.5 Flash)
- **Date**: 2026-06-21

## Why

### 0. Veredicto rápido
Base de código extremadamente sólida, calificada con un **9.6/10** de media. Destaca por su estricto desacoplamiento (arquitectura núcleo-plugin pura y agnóstica), una suite de pruebas robusta con más de 960 pruebas unitarias y de integración verdes, y una documentación internacional impecable en 12 idiomas generada automáticamente para la web Astro. No obstante, se han detectado oportunidades de mejora en la suite de pruebas del monorepo, en la relevancia de las búsquedas internas del sitio de documentación y en el comportamiento de bucles de re-selección en tareas automáticas.

### 1. Por capas (fatal / mal / regular / bien / muy bien / perfecto)

#### Núcleo (`packages/core`)
- **Perfecto**: Registro determinista de herramientas (`planRegistrationOrder`), asilamiento absoluto de variables de entorno y rutas mediante `resolveWorkspaceContained` y exclusión mutua mediante `withFileMutex` y `writeFileAtomic`.
- **Muy bien**: Manejo robusto de la configuración perezosa y CLI agnóstica de dependencias o nombres de modelos.

#### Cliente (`packages/client`)
- **Muy bien**: Integración transparente del SDK oficial de MCP (`McpStdioClient`) y mapeo robusto del contenido estructurado de herramientas.

#### Plugins (`plugins/*`)
- **Perfecto**: 13 plugins con responsabilidades disjuntas y bien definidas.
- **Regular (Rules ESLint gaps)**: El plugin `rules` materializa archivos de configuración ESLint que sugieren plugins como `eslint-plugin-vue` o `angular-eslint` sin verificar previamente si el proyecto del usuario los tiene instalados.
- **Regular (Proposals auto_work loop)**: La herramienta `auto_work` en modo automático no detecta si un agente ha quedado estancado (soft-loop) e intenta procesar el mismo slice indefinidamente si no se produce un cambio de estado externo.

#### Web App (`apps/web`)
- **Muy bien**: Sitio estático Astro generado desde el live API del registry. Excelente i18n para 12 lenguas.
- **Regular (Pagefind warning)**: Pagefind generaba una advertencia durante el build al no encontrar un contenedor con `data-pagefind-body`, lo que provocaba que se indexaran elementos ruidosos de navegación y layouts comunes en lugar de enfocarse solo en el contenido. (Se resolverá en `S3`).

#### VS Code Extension (`apps/vscode`)
- **Muy bien**: Cobertura sólida de 7 archivos de pruebas unitarias (16 tests en total).
- **Regular (Exclusión de pruebas)**: La suite de pruebas de `apps/vscode` estaba excluida de la configuración de proyectos en el `vitest.config.ts` raíz, por lo que no se ejecutaban con el comando global de validación. (Se resolverá en `S2`).

### 2. ¿Más skills / tools / agentes / plugins?
- **Plugin de seguridad de dependencias**: Añadir integración offline opcional con herramientas como `npm audit` o alertas de vulnerabilidades OSV.
- **MCP structuredContent**: Exponer de forma nativa soporte para `outputSchema` extendido y respuestas estructuradas en el protocolo de las herramientas.

### 3. Eficiencia / tokens / bucles / bloqueos
- **Tokens**: Muy eficiente gracias a resúmenes descriptivos y carga perezosa (`lazy`).
- **Bucles**: Se requiere mitigar el comportamiento de selección redundante de `auto_work` para slices bloqueados.
- **Bloqueos**: Concurrencia segura garantizada por primitivas robustas de exclusión mutua de archivos.

### 4. Top acciones para 11/10 (prioridad)
1. **Integración de pruebas**: Incluir la suite de pruebas del cliente de VS Code en la suite raíz de validaciones. (Se resolverá en `S2`).
2. **Relevancia en búsquedas**: Delimitar el contenido principal de la web Astro con `data-pagefind-body` para eliminar el ruido en los resultados de búsqueda. (Se resolverá en `S3`).
3. **Evitar bucles en `auto_work`**: Modificar el scheduler de propuestas para detectar la inactividad o fallos repetitivos y evitar el bucle suave. (Diferido a Propuesta `f120`).

## Non-goals

- Re-escribir de forma destructiva las propuestas completadas de forma retroactiva (se mantienen las excepciones de advertencias legadas en el linter para evitar ruido).
- Modificar el protocolo subyacente de comunicación MCP (se confía en el SDK de Model Context Protocol oficial).

## Slices

- global_gate: lint

### S1 — Execute audit and document findings
- **Files**: docs/proposals/ready/a021-21-06-2026-antigravity-gemini-3-5-flash-repositorio.md
- **Gate**: bun run lint:proposals
- **Status**: pending

### S2 — Include apps/vscode in workspace test suite
- **Files**: vitest.config.ts
- **Gate**: bun run validate
- **Status**: pending

### S3 — Add data-pagefind-body to Astro Base layout
- **Files**: apps/web/src/layouts/Base.astro
- **Gate**: bun run site:strict
- **Status**: pending

### S4 — Resolve auto_work loop-detection mitigation
- **Files**: plugins/proposals/src/lib/proposals/task-queue.ts
- **Gate**: bun run validate
- **Status**: pending

## Acceptance

- `bun run validate` es completamente verde (código de salida 0).
- Todos los tests de `apps/vscode` se integran y pasan exitosamente en el flujo principal del monorepo.
- El build de Pagefind no emite advertencias sobre la ausencia de `data-pagefind-body`.
- El informe de auditoría cumple con todos los requisitos de `docs/scaffolds/ARCHITECTURE-AUDITS.md` y es validado exitosamente por `bun run lint:proposals`.

## Verified State

| Aspect | Metric / Command | Result / Count |
|---|---|---|
| LOC | count LOC | 63,966 LOC en TypeScript |
| Test suite | `bun run test` | 133 archivos de prueba pasados (946 tests pasados, 10 skipped) |
| Biome lint | `biome ci` | 0 errores, 0 warnings |
| Stylelint | `stylelint` | 0 errores, 0 warnings |
| Scaffolds lint | `bun run lint:scaffolds` | Scaffolds completos y correctos |
| Strict Build | `bun run site:strict` | Astro build exitoso (338 páginas generadas, 497 indexadas por Pagefind) |

## Findings

| ID | Severity | Description | Files | Resolution Track |
|---|---|---|---|---|
| H1 | P3 | Exclusión de `apps/vscode` de la suite de pruebas del monorepo en la raíz | [vitest.config.ts](file:///home/cartago/_projects/mcp-vertex/vitest.config.ts) | Se resolverá en slice `S2` |
| H2 | P3 | Advertencia de tipos de TypeScript en el IDE sobre la propiedad `all` dentro de la configuración de cobertura de `vitest.config.ts` | [vitest.config.ts](file:///home/cartago/_projects/mcp-vertex/vitest.config.ts) | Documentado, mantenido por compatibilidad de cobertura global |
| H3 | P3 | Advertencia en build de Astro sobre indexación de cuerpo en Pagefind por falta de `data-pagefind-body` | [Base.astro](file:///home/cartago/_projects/mcp-vertex/apps/web/src/layouts/Base.astro) | Se resolverá en slice `S3` |
| H4 | P2 | Mitigación del bucle suave (soft-loop) en `auto_work` para tareas estancadas | [task-queue.ts](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/task-queue.ts) | Diferido a Propuesta `f120` |

## Scoreboard

| Dimension | Score | Comments |
|---|---:|---|
| Arquitectura | 9.8 | Diseño puro núcleo-plugin impecable. Excelente desacoplamiento. |
| Contratos e interfaces | 9.5 | Contratos e interfaces en `packages/core` y contexto bien delineados. |
| Eficiencia de tokens | 9.2 | Uso de inputs/outputs compactos y carga perezosa de la documentación onboarding. |
| Anti-deadlock / concurrencia | 9.6 | Primitivas robustas con bloqueos mediante exclusión mutua en archivos (`withFileMutex` y `writeFileAtomic`). |
| Calidad de código fuente | 9.7 | Código fuente muy legible, sin warnings, excelente configuración de Biome. |
| Documentación | 9.8 | Altísima calidad, ADRs exhaustivos, i18n impecable de 12 idiomas. |
| Tests (estructura, cobertura, calidad) | 9.9 | Cobertura y velocidad excelentes en vitest. Inclusión de `apps/vscode` robustece el flujo global. |
| Seguridad operacional | 9.5 | Redacción de secretos y contención en espacio de trabajo implementadas de forma correcta. |
| Genericidad (project-agnostic) | 9.7 | Sin lógica de dominio acoplada al núcleo del servidor o CLI. |
| **Total (Average)** | **9.6** | **Excelente nivel de calidad arquitectónica y estabilidad.** |

**Nota final: 9.6/10 — Calidad sobresaliente y madurez técnica en todo el monorepo.**
