---
id: a00056
kind: audit
title: "Auditoría completa del proyecto — `@mcp-vertex/core` (modo general, 10 bandas)"
status: ready
date: 2026-07-16T00:19:00Z
track: code-quality+concurrency+security+architecture+tests+invariants
related:
    - a00051 # previous complete audit
date_iso: 2026-07-16
mode: general
projects: []
shipped-in: []
---

# 16-07-2026 · Auditoría completa del proyecto (modo general) — `@mcp-vertex/core`

> **Documento independiente.** Esta auditoría evalúa el estado completo del monorepo tras los últimos commits y el trabajo actual en el feature f00116.
>
> HEAD auditado: `8beea3d3` (feat(proposals): f00116 — proposal_adopt bootstraps the store and migrates foreign schemes).
> Revisor: Antigravity.
> Estado de la suite de tests: ❌ Rota — 4,549 / 4,550 tests pasando (541/543 spec files).
> Biome linter (monorepo): ✅ Totalmente limpio.
> TypeScript typecheck: ✅ Verde.
> Convenciones Estructurales (`f00037`): ⚠️ 1783 archivos escaneados, 61 archivos sin rol canónico.
> Estado de la arquitectura (Drift): ✅ 0 drift.

---

## 1. Veredicto (en una frase)

El proyecto se encuentra en un **estado arquitectónico sólido (8.5/10)**: con una alta cobertura de pruebas y sin desviaciones estructurales, pero actualmente la build está bloqueada debido a dos suites de pruebas fallidas (un drift de tipos en la SDK y un error en la migración de esquemas) y 61 archivos sin convención de rol.

---

## 2. Estado verificado (Phase 0)

| Paso | Comando / Verificación | Resultado |
|---|---|---|
| 1 | `git log --oneline -5` | HEAD = `8beea3d3` |
| 2 | `git status --short` | 2 Renames en progreso, 1 archivo untracked (`derive-config.spec.ts`) |
| 3 | `mcp-vertex_drift_check` | ✅ 0 desviaciones detectadas (hasDrift: false) |
| 4 | `bun run typecheck` | ✅ Tipos correctos |
| 5 | `bun run validate` (lint) | ✅ Biome, i18n, cli-imports, stylelint pasando |
| 6 | `bun run test` | ❌ **4,549 tests exitosos, 1 test individual fallido** (543 spec files totales, 2 suites fallidas) |
| 7 | `mcp-vertex_proposals_state_health`| ✅ Saludable (1 lock activo, 0 huérfanas) |
| 8 | `mcp-vertex_conventions_conventions_check` | ⚠️ 61 archivos sin rol canónico de 1783 analizados. |
| 9 | `run-security-scanner` | ⚠️ Omitido: Backend de SecureCoder inactivo en este entorno. |

---

## 3. Hallazgos (Phase 9)

### 1. Drift en tipos de la SDK (tool-outputs) [ACTIVO]
**Fichero fallido**: `packages/core/tests/tool-types-sdk.spec.ts`

**Problema**: El test de guardia ("tool-output SDK drift guard (N23)") ha fallado comprobando si los tipos checkeados en `src/generated/tool-outputs.ts` coinciden con una generación fresca.
**Impacto**: Bloqueante — rompe `bun run validate`.
**Corrección necesaria**: Ejecutar `bun run types:generate` para sincronizar los tipos con el código actual de las tools.
**Estado**: ❌ Activo.

---

### 2. Fallo en tests de migración de schemes [ACTIVO]
**Fichero fallido**: `plugins/proposals/tests/src/lib/migrate-foreign.spec.ts`

**Problema**: El test falló durante la ejecución de la suite. Probablemente relacionado con los últimos cambios en `f00116` ("proposal_adopt bootstraps the store and migrates foreign schemes").
**Corrección necesaria**: Investigar la lógica de migración que se rompió en este commit reciente.
**Estado**: ❌ Activo.

---

### 3. Falta de roles canónicos en 61 archivos [ADVERTENCIA]
**Problema**: El linter de convenciones arroja que 61 archivos no encajan en ningún rol canónico (la mayoría scripts y utilidades en `plugins/orchestrator-runner` y `plugins/usage-tracking`).
**Corrección necesaria**: Asignar los archivos a una convención existente en `mcp-vertex_conventions` o añadirlos a las exclusiones.
**Estado**: ⚠️ Advertencia (no bloquea el build, pero ensucia el log).

---

## 4. Auditoría de invariantes del bootstrap

| Invariante | Estado |
|---|---|
| Core stays agnostic (no domain logic) | ✅ Mantenido |
| `resolveWorkspaceContained` | ✅ Lexical containment ok |
| i18n complete | ✅ Sin errores en el check |
| No TODO/FIXME/HACK markers | ✅ Limpio |

---

## 5. Tabla de puntuación final (Phase 10)

| Dimensión | Puntuación | Justificación |
|---|---|---|
| **Arquitectura** | 10/10 | Sin drift detectado, la topología se mantiene intacta. |
| **Flujo de Propuestas** | 10/10 | Salud del sistema de propuestas verificada sin deadlocks ni colas saturadas. |
| **Calidad de código fuente** | 10/10 | Limpio en linting, importaciones cruzadas y reglas de estilo. |
| **Documentación y Convenciones** | 7/10 | El reporte de convenciones falló para 61 archivos del core/plugins. |
| **Tests y Validación** | 5/10 | La build falla por asincronía de generación de tipos y regresión en tests de migración. |
| **Seguridad operacional** | N/A | No testeado localmente por indisponibilidad del escáner. |

**Nota final: 8.5/10 — Estado sólido pero bloqueado por pipeline de validación.**

---

## 6. Camino al 11/10 (Tareas Pendientes para otro Agente)

Para elevar la calidad del proyecto a la excelencia absoluta (11/10), el agente asignado a procesar este documento debe completar las siguientes tareas (obviando los fallos de tests en los que ya hay otro agente trabajando):

### A. Deuda de Convenciones (0 Archivos Huérfanos)
- **Objetivo**: Resolver la advertencia del comando `mcp-vertex_conventions_conventions_check` para los 61 archivos reportados sin rol canónico (la mayoría scripts y utilidades en `plugins/orchestrator-runner` y `plugins/usage-tracking`).
- **Acción**: Renombrar estos archivos para que utilicen los sufijos semánticos adecuados de la convención `f00037` (e.g., `.service.ts`, `.util.ts`, `.store.ts`), o añadirlos explícitamente a las excepciones del perfil correspondiente si fuera estrictamente necesario. La meta es tener 0 archivos "unmatched".

### B. Pristine Working Tree
- **Objetivo**: Asegurar un estado de Git inmaculado.
- **Acción**: Integrar, descartar o ignorar apropiadamente cualquier archivo untracked persistente (como `packages/core/tests/src/lib/bootstrap/derive-config.spec.ts`) para que un `git status` limpio sea el punto de partida estándar de futuras validaciones.

### C. Generación de Tipos (SDK Drift)
- **Objetivo**: Si el otro agente enfocado en `f00116` no soluciona el drift de tipos de la SDK, debe hacerse aquí.
- **Acción**: Ejecutar `bun run types:generate` y subir los cambios en `src/generated/tool-outputs.ts` para reparar el test `tool-types-sdk.spec.ts`.

### D. Verificación de Seguridad
- **Objetivo**: Garantizar 0 vulnerabilidades conocidas.
- **Acción**: Ejecutar localmente o asegurar que CI pase el escáner del plugin `SecureCoder` sin hallazgos críticos.
