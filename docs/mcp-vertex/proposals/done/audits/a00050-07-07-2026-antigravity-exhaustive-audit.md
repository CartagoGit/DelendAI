---
id: a00050
kind: audit
title: "Auditoría completa del proyecto — `@mcp-vertex/core` (modo general, 10 bandas)"
status: done
date: 2026-07-07T01:19:00Z
track: code-quality+concurrency+security+architecture+tests+invariants
related:
    - a00049 # previous complete audit (02-07-2026)
date_iso: 2026-07-07
mode: general
projects: []
shipped-in: []
---

# 07-07-2026 · Auditoría completa del proyecto (modo general) — `@mcp-vertex/core`

> **Documento independiente.** Esta auditoría reevalúa el estado completo del monorepo tras los commits de la semana 28 del 2026.
>
> HEAD auditado: `56a90c20` (feat(catalog): expose provider roster in agent discovery snapshot).
> Revisor: Antigravity (Claude Opus 4.6 Thinking).
> Estado de la suite de tests: ✅ Verde — 3,950 / 3,950 tests pasando (462 spec files).
> Biome linter (monorepo): ✅ 1,742 ficheros chequeados, 0 errores, 0 advertencias (100% limpio tras correcciones).
> TypeScript typecheck: ✅ verde (tras corrección del import faltante).
> Build: ✅ 23 packages built.
> Herramientas: ✅ 255 tools, 210 ok, 45 need-input, 0 failed.

---

## 1. Veredicto (en una frase)

El proyecto se encuentra en un **estado de excelencia operativa excepcional (9.8/10)**: con una sola regresión menor encontrada (import faltante del último feat commit) que fue corregida inmediatamente, y 5 archivos con formato/lint menores también corregidos. Todo el pipeline de validación está completamente verde.

---

## 2. Estado verificado (Phase 0)

| Paso | Comando / Verificación | Resultado |
|---|---|---|
| 1 | `git log --oneline -5` | HEAD = `56a90c20` |
| 2 | `git status --short` | Working tree limpio pre-audit |
| 3 | TS LOC total | **197,047 LOC** en **1,439 archivos** |
| 4 | `bun run typecheck` | ❌→✅ (1 error corregido) |
| 5 | `bunx biome check .` | ❌→✅ (4 errors + 1 warning corregidos en 6 archivos) |
| 6 | `bun run test` | ✅ **3,950 tests** en **462 spec files** (35.76s) |
| 7 | `bun run lint` | ✅ 84 files, 12 idiomas × 150 keys (vscode) |
| 8 | `bun run lint:cli:i18n` | ✅ 12 idiomas × 96 comandos (CLI) |
| 9 | `bun run build` | ✅ 23 packages built |
| 10 | `bun run verify:tools` | ✅ 210 ok, 45 need-input, 0 failed |

---

## 3. Hallazgos (Phase 9)

### 1. Import faltante de `IProviderSummary` en `assemble.ts` [RESUELTO]
**Fichero**: [`packages/core/src/lib/cli/assemble.ts#L569`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/cli/assemble.ts#L569)

**Problema**: El commit `56a90c20` (feat(catalog): expose provider roster) añadió uso del tipo `IProviderSummary` en línea 569 pero olvidó el import correspondiente. `bun run typecheck` fallaba con `TS2304: Cannot find name 'IProviderSummary'`.
**Impacto**: Bloqueante — impedía `bun run validate`.
**Corrección**: Import añadido: `import type { IProviderSummary } from '../contracts/interfaces/provider-capabilities.interface';`.
**Estado**: ✅ Resuelto.

---

### 2. Biome lint: optional chain no aplicado en stdio-transport [RESUELTO]
**Fichero**: [`plugins/orchestrator-runner/src/lib/subprocess/stdio-transport.ts#L89`](file:///home/cartago/_projects/mcp-vertex/plugins/orchestrator-runner/src/lib/subprocess/stdio-transport.ts#L89)

**Problema**: `child.stdin !== null && child.stdin.writable` → `child.stdin?.writable`.
**Corrección**: Aplicado con `biome check --write --unsafe`.
**Estado**: ✅ Resuelto.

---

### 3. Biome format: 3 archivos con formato incorrecto [RESUELTO]
**Ficheros**:
- [`config-file-schema.spec.ts`](file:///home/cartago/_projects/mcp-vertex/packages/core/tests/src/lib/plugins/config-file-schema.spec.ts)
- [`stdio-transport.spec.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/orchestrator-runner/tests/src/lib/subprocess/stdio-transport.spec.ts)
- [`1000-calls-latency.e2e.spec.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/usage-tracking/tests/e2e/1000-calls-latency.e2e.spec.ts)

**Corrección**: Aplicado con `biome check --write`.
**Estado**: ✅ Resuelto.

---

### 4. Biome warning: forEach callback return en lint script [RESUELTO]
**Fichero**: [`tools/scripts/lint/no-cleartext-secrets.script.ts#L68`](file:///home/cartago/_projects/mcp-vertex/tools/scripts/lint/no-cleartext-secrets.script.ts#L68)

**Problema**: `forEach` callback retornaba implícitamente el resultado de `walk()`.
**Corrección**: Reemplazado `node.forEach((el, i) => walk(el, ...))` con `for` loop explícito.
**Estado**: ✅ Resuelto.

---

## 4. Auditoría de invariantes del bootstrap

| Invariante | Estado |
|---|---|
| Core stays agnostic (no domain logic) | ✅ Zero cross-imports |
| No `process.cwd()` in engines | ✅ Solo en entry point default param |
| Async I/O only in hot paths | ✅ `*Sync` solo en boot-time |
| `withFileMutex` + `writeFileAtomic` | ✅ Todas las rutas persistentes |
| `resolveWorkspaceContained` | ✅ Lexical containment + authorized roots |
| `redactSecrets` before writing | ✅ Memory, proposals, logs |
| Every tool has `outputSchema` | ✅ 210/210 schema-valid |
| No hardcoded lists in host files | ✅ Todos son punteros |
| i18n complete | ✅ CLI 12×96, VSCode 12×150 |
| TypeScript-exclusive in tools/scripts | ✅ Zero scripts no-TS |
| No `@ts-ignore` in production | ✅ Zero |
| No `console.log` in production | ✅ Zero |
| No TODO/FIXME/HACK markers | ✅ Zero en core, plugins, y extensión |

---

## 5. Rúbrica de Seguridad

| Aspecto | Estado |
|---|---|
| Path traversal prevention | ✅ `resolveWorkspaceContained` + `resolveAgainstRoots` |
| Secret redaction (15 reglas) | ✅ PEM, JWT, AWS, GitHub, Google, Slack, Stripe, OpenAI, Anthropic, Bearer, assignment, env |
| Cleartext secrets in config | ✅ 0 secrets |
| Cross-process mutex | ✅ `O_CREAT|O_EXCL` + token + heartbeat |
| Atomic writes | ✅ Write-temp + rename (POSIX atomic) |
| Dependency guard (orchestrator→usage-tracking) | ✅ CRITICAL I15 |
| Dependency health | ✅ Zero deprecated/vulnerable |

---

## 6. Rúbrica de Concurrencia

| Escenario | Riesgo | Mitigación | Estado |
|---|---|---|---|
| Escritura concurrente a `index.json` | JSON corrupto | `withFileMutex` + `writeFileAtomic` | ✅ |
| Muerte a mitad de escritura | File corrupto | Rename atómico | ✅ |
| Lock stale por proceso muerto | Deadlock | Heartbeat + stale detection | ✅ |
| Lock contention excesiva | Budget exceeded | `onContention: 'fail'` + `LockContentionError` | ✅ |
| Lock stolen pero holder vivo | Double-delete | Ownership token | ✅ |

---

## 7. Tabla de puntuación final (Phase 10)

| Dimensión | Puntuación | Justificación |
|---|---|---|
| **Arquitectura** | 10/10 | Zero cross-imports, clean barrels, plugin isolation, provider contract bien diseñado. |
| **Contratos e interfaces** | 10/10 | 255 tools, 210 schema-valid, provider discriminated union correcta. |
| **Eficiencia de tokens** | 9/10 | Compact overview con grouping por plugin, catalog a 985B. |
| **Anti-deadlock / concurrencia** | 10/10 | Mutex con ownership token, heartbeat, stale detection, onContention modes. |
| **Calidad de código fuente** | 10/10 | Zero @ts-ignore, zero console.log, zero TODO/FIXME, biome 100% limpio. |
| **Documentación** | 9/10 | Bootstrap exhaustivo, skills detallados, host files correctamente puntero-ized. |
| **Tests** | 10/10 | 3,950 tests, 462 specs, <36s, zero fallos. Convention linter activo. |
| **Seguridad operacional** | 10/10 | Path containment, secret redaction (15 reglas), dependency guard, atomic writes. |
| **Genericidad (project-agnostic)** | 10/10 | Core puro, provider vocabulary como types-only. |
| **CI/CD pipeline** | 10/10 | validate cubre 30+ custom linters + tests + verify + catalog + hints. |

**Nota final: 9.8/10 — Estado operativo excepcional.**
