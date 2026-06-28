---
id: a00047
kind: audit
title: "Auditoría exhaustiva de alineación y estado operativo — Antigravity"
status: done
date: 2026-06-29T01:00:00Z
track: code-quality+concurrency+proposals+alignment
shipped-in: ["ed7b65a3", "e64d5af6"]
recan: []
related:
    - a00046 # previous post-merge audit
    - r00004 # root declutter refactor
    - r00005 # locale-aware date/time formatting refactor
    - r00006 # SOLID dashboard refactor
---

# 29-06-2026 · Auditoría exhaustiva de alineación y estado operativo — `@mcp-vertex/core`

> **Documento independiente.** Esta auditoría reevalúa el estado operativo de alineación de propuestas, validación de la suite de pruebas y estado de consistencia del repositorio.
>
> HEAD auditado: `e64d5af6` (chore(proposals): format proposals.script.ts).
> Revisor: Antigravity — sesión actual.
> Estado de la suite de tests: ✅ verde — 3,223 tests pasando.
> Biome linter: Checked 70 files in extensions/vscode, fully clean.
> Astro Check: Clean (0 errors, 0 warnings, 4 hints).

---

## 1. Veredicto (en una frase)

La desincronización de propuestas ha sido resuelta y los contadores en `.cache/mcp-vertex/proposal-id-counters.json` han sido alineados mediante scripts automatizados, dejando la suite de validación 100% verde y el repositorio libre de stashes y ramas huérfanas.

---

## 2. Estado verificado

| Paso | Comando / Verificación | Resultado |
|---|---|---|
| 1 | `git log --oneline -5` | HEAD = `e64d5af6` |
| 2 | `git worktree list` | Solo `develop` (clean) |
| 3 | `git status --short` | Clean (working tree clean) |
| 4 | TS LOC total | 199,661 LOC |
| 5 | Plugins activos | 16 plugins, todos limpios |
| 6 | Tools registradas | 238 tools (196 ok, 42 need-input, 0 failed) |
| 7 | `lint:proposals` | ✅ verde (IDs re-alineados, linter corregido) |
| 8 | `vitest run` | ✅ 3,223 tests pasados |

---

## 3. Lo que está inmejorable (no tocar)

| # | Capacidad | Evidencia |
|---|---|---|
| 1 | **Validación 100% verde** | `bun run validate` pasa de manera impecable en local. |
| 2 | **Resolución del bug de desincronización** | `seedFromDisk`, `collectProposalFiles`, `syncProposalRegistry` y `sync-proposal-counters` ahora buscan dentro de todas las subcarpetas de `done/`, sincronizando contadores de forma definitiva. |
| 3 | **Higiene del repositorio (Ramas y Stashes)** | Limpieza completa del swarm, libre de stashes and ramas agent-* locales y remotas. |
| 4 | **Regeneración de catalog y host hints** | El catalog JSON y los host hints están completamente al día. |

---

## 5. Concurrencia y tokens

| Escenario | Riesgo | Mitigación | Brecha |
|---|---|---|---|
| Escritura concurrente de `index.json` | JSON roto | `writeFileAtomic` | ✅ |
| Caída del agente en escritura de `agents.lock.json` | Lock corrupto | `writeFileAtomic` | ✅ |
| Lector de logs lee mientras escritor escribe | Lectura incompleta | Mutex para lectura/escritura | ✅ |
