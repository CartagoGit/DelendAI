---
id: f122
kind: feat
title: Race fix — atomic + mutex en sync-proposal-registry.ts:331
status: ready
type: proposal
track: proposals-plugin
date: 2026-06-21
---

# f122 — Race fix — atomic + mutex en sync-proposal-registry.ts:331

## Goal

Cerrar el hallazgo H1 (P0) de la auditoría a022 cerrando la ventana de inconsistencia entre el write crudo a `in-progress/` y el `rename` a `historical/` en `reconcileAndArchiveCompletedRootProposals`.

El bug: `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts:331` ejecuta `await writeFile(sourcePath, reconciled, 'utf8')` directamente con `node:fs/promises.writeFile`, sin pasar por la primitiva `writeFileAtomic` (ya importada en la línea 4 del archivo) ni por `withFileMutex`. Si el proceso muere entre ese `writeFile` y el `rename` posterior a `historical/`, el archivo en `in-progress/` puede quedar con contenido parcial truncado, o un contenido que ya no refleja la propuesta original.

El fix tiene 3 componentes:

1. Reemplazar `await writeFile(sourcePath, reconciled, 'utf8')` por `await writeFileAtomic(sourcePath, reconciled)`. La primitiva ya está disponible en el barrel público del core y ya se usa en otros 4 sitios de este mismo plugin (`agent-lock-engine.ts`, `agent-registry-store.ts`, `sync-proposal-registry.ts:498,572`).
2. Envolver la sección crítica `writeFileAtomic → rename` en `withFileMutex(sourcePath, ...)` para evitar interleavings con otros agentes (un humano haciendo `git mv`, otro agente llamando `proposals_sync`).
3. Mantener el comportamiento de `rename` a `historical/` (no se elimina la carpeta histórica, se preserva la convención de archivo).

## Why

- AGENTS.md, invariante 4: "Durable writes go through the primitives. Persisted state uses `withFileMutex` + `writeFileAtomic`; corrupt ≠ empty (`quarantineCorruptFile`)". El bypass actual en `sync-proposal-registry.ts:331` rompe ese invariante en uno de los motores más críticos del monorepo (la registry de proposals es el estado del que depende la orquestación multi-agente).
- Una propuesta huérfana en `in-progress/` tras un kill -9 puede ser leída por otro agente que crea que la propuesta sigue en curso cuando en realidad está duplicada en `historical/`. Esto dispara `reconcileFolders` con dos entradas para el mismo id, y el resultado es silencioso (un test actual no lo detectaría).
- Es el **único** bypass de la primitiva `writeFileAtomic` en todo el código de producción fuera de las plantillas de scaffold. Es deuda técnica aislada, no sistémica, y arreglarla cierra definitivamente el master audit M28 (mutex de propuestas).

## Non-goals

- Reescribir todo `sync-proposal-registry.ts`; el fix es local a la función `reconcileAndArchiveCompletedRootProposals`.
- Cambiar la convención de archivo a `historical/`; se preserva.
- Añadir un nuevo mecanismo de lock distribuido; el `withFileMutex` del core es suficiente para un solo host.

## Slices

### S1 — Refactor sync-proposal-registry.ts:331 a writeFileAtomic + withFileMutex
  - **Status**: ready
  - **Files**: `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`
  - **Command**: `bun run validate`
  - **Expect**: green; `writeFile` crudo reemplazado por `writeFileAtomic`; sección crítica envuelta en `withFileMutex`; comportamiento observable idéntico al actual.
  - **Acceptance**:
    - `writeFile` crudo reemplazado por `writeFileAtomic`
    - Sección crítica envuelta en `withFileMutex`
    - Comportamiento observable idéntico al actual

### S2 — Spec de concurrencia: crash simulado + 8-way paralelo + happy path
  - **Status**: ready
  - **Files**: `plugins/proposals/tests/src/lib/proposals/sync-proposal-registry-reconcile.spec.ts`
  - **Command**: `bunx vitest run plugins/proposals/tests/src/lib/proposals/sync-proposal-registry-reconcile.spec.ts && bun run validate`
  - **Expect**: green; 3 tests nuevos que cubren crash simulado, 8-way paralelo y happy path.
  - **Acceptance**:
    - Test de crash simulado entre `writeFileAtomic` y `rename`
    - Test de 8 reconciliaciones paralelas convergen
    - Test de happy path preserva comportamiento

## Acceptance

- [ ] `bun run validate` es verde.
- [ ] Spec nuevo en `plugins/proposals/tests/src/lib/proposals/sync-proposal-registry-reconcile.spec.ts` que: (a) fuerce un crash simulado entre el `writeFileAtomic` y el `rename` y valide que el original es bit-identical al que había antes de la operación; (b) ejecute 8 reconciliaciones en paralelo contra el mismo source y valide que el resultado final es consistente (convergencia); (c) confirme que el comportamiento observable (folder final, contenido del archivo en `historical/`) no cambia para el caso feliz.
- [ ] 0 invocaciones de `await writeFile(` en `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts` que escriban estado de propuesta (verificable con `grep -n 'writeFile' plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`).
- [ ] `bun run lint:proposals` valida este documento.
- [ ] Cita cruzada desde `a022` (H1) y desde el master audit marcada en el checklist.

## Risks and mitigations

- **R1**: el `withFileMutex` introduce overhead mínimo en una operación que ya era I/O-bound. **Mitigación**: el test de 8-way paralelo confirma que la convergencia sigue siendo sub-100ms.
- **R2**: si el archivo está siendo leído por otro proceso mientras hacemos `writeFileAtomic` (que internamente es write-temp + rename), el lector verá el contenido nuevo o el viejo, nunca uno corrupto. **Mitigación**: ya está garantizado por la primitiva.

## Notes

- **Auditoría origen**: `a022-21-06-2026-copilot-minimax-m3-repositorio.md` (H1, severidad P0).
- **Master audit**: cierra M28 (mutex de propuestas), que llevaba varios ciclos marcado como "in-progress" por esperar este fix.
- **Primitivas del core**: `writeFileAtomic` y `withFileMutex` (exportadas en `packages/core/src/public/index.ts`).
- **Tamaño del fix**: 5-10 líneas en el archivo de implementación + 1 spec nuevo. Impacto desproporcionado: cierra el único bypass de la primitiva durable en el código de producción.
