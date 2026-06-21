---
id: f122
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

Acceptance:
- `bun run validate` verde.
- Spec nuevo en `plugins/proposals/tests/src/lib/proposals/sync-proposal-registry-reconcile.spec.ts` que: (a) fuerce un crash simulado entre el `writeFileAtomic` y el `rename` y valide que el original es bit-identical al que había antes de la operación; (b) ejecute 8 reconciliaciones en paralelo contra el mismo source y valide que el resultado final es consistente (convergencia); (c) confirme que el comportamiento observable (folder final, contenido del archivo en `historical/`) no cambia para el caso feliz.
- `bun run lint:proposals` valida este documento.
- Cita cruzada desde `a022` (H1) y desde el master audit.

## Slices

- global_gate: lint

### s1 — Refactor sync-proposal-registry.ts:331 a writeFileAtomic + withFileMutex
- files: plugins/proposals/src/lib/proposals/sync-proposal-registry.ts
- gate: e2e
- acceptance:
  - "writeFile crudo reemplazado por writeFileAtomic"
  - "Sección crítica envuelta en withFileMutex"
  - "Comportamiento observable idéntico al actual"
- status: pending

### s2 — Spec de concurrencia: crash simulado + 8-way paralelo + happy path
- files: plugins/proposals/tests/src/lib/proposals/sync-proposal-registry-reconcile.spec.ts
- gate: e2e
- acceptance:
  - "Test de crash simulado entre write y rename"
  - "Test de 8 reconciliaciones paralelas convergen"
  - "Test de happy path preserva comportamiento"
- status: pending
