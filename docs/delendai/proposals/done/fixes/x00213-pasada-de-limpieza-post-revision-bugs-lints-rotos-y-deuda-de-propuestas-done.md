---
id: x00213
title: "Pasada de limpieza post-revisión: bugs, lints rotos y deuda de propuestas 'done'"
kind: fix
status: done
type: proposal
track: quality+proposals+lint-baseline
date: 2026-08-24
---

# x00213 — Pasada de limpieza post-revisión: bugs, lints rotos y deuda de propuestas "done"

## Goal

Dejar `bun run validate` verde y el repo en estado "11 de 10": corregir los hallazgos de la revisión de propuestas completadas (2026-08-24), ordenados de crítico a trivial. La revisión detectó que varias propuestas cerradas como `done` dejaron residuos: lints en rojo sin baselinar, archivos fuera de convención, un slice huérfano y deuda de archivado.

## why

La revisión de las propuestas `done` (siguiendo las instrucciones iniciales: "revisa que no hay bugs y que realmente están completas") encontró que el `validate` completo está roto. Los fallos no son de una sola propuesta, sino acumulación de cierres incompletos que no dejaron los gates verdes. Sin esta pasada, `bun run validate` no es una señal fiable para ninguna propuesta futura.

## non-goals

- No reimplementar la resolución de plugins bajo Node real (x00193 S1) — el sandbox no tiene binario `node`; se documenta y se deja la propuesta abierta.
- No reescribir los plugins `error-reporting` / `issues-triage` (f00158 en curso por otro agente) — solo se alinean a los gates sin cambiar su comportamiento.
- No tocar las propuestas `ready/` de otros agentes (c00127, f00157, f00158, r00014, r00015, x00208-x00212).

## slices

- global_gate: type

### S1 — `lint:solid`: 524 hallazgos nuevos fuera de baseline
- **Status**: done
- **Files**: `packages/core/src/lib/scan/dip-violation.ts`, archivos afectados (ver detalle)
- **Gate**: type
- acceptance:
  - "Los 8 hallazgos 'reales' quedan corregidos: 3 `process.cwd()` (2 son falsos positivos por docstring/comentario y se arregla el detector para excluir comentarios), 4 `sync node:fs import` y 1 `empty catch`."
  - "El detector `dip-violation.ts` ignora líneas de comentario/docstring (el regex `process\.cwd\s*\(` no debe disparar sobre `// ...` o `* ...`)."
  - "Los 173 `duplicated across` y 343 `magic number` restantes se resuelven con un rebaseline deliberado (`--update`) documentando la deuda aceptada, o se refactorizan; nunca quedan como fallo silencioso."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: bun run validate verde confirmado empíricamente tras corregir el drift residual que x00213 no había cerrado del todo.
### S2 — `lint:tools`: escáner no excluye `node_modules`
- **Status**: done
- **Files**: `tools/scripts/lint/no-shell-python.script.ts`
- **Gate**: type
- acceptance:
  - "El escáner excluye cualquier ruta bajo `**/node_modules/**` (hoy reporta `tools/docs-api/node_modules/lunr/build/release.sh`, un artefacto de typedoc, no código propio)."
  - "`bun run lint:tools` sale 0."

### S3 — `lint:stray-cache-files`: directorio stray `agent-queue`
- **Status**: done
- **Files**: `tools/scripts/lint/check-stray-cache-files.script.ts`
- **Nota (2026-09-03)**: esta slice declaraba
  `.cache/mcp-vertex/agent-queue/queue.json`, que `.gitignore` excluye. El
  entregable era BORRAR ese directorio stray, no versionar un fichero — pero
  `Files:` alimenta el staging de commit-policy, así que `git add` lo rechazaba
  y el evento se reemitía varias veces por segundo mientras el servidor
  estuviera vivo. Ahora apunta al gate que impide la reaparición, que es el
  artefacto que realmente cambió en el repositorio.
- **Gate**: none
- acceptance:
  - "`bun run lint:stray-cache-files` sale 0 (el dir `agent-queue` deja de existir o se mueve a `tools/scripts/`)."

### S4 — `lint:types-in-contracts`: 24 archivos con tipos exportados fuera de contracts/
- **Status**: done
- **Files**: `plugins/usage-tracking/src/lib/services/checkpoint-advisory.service.ts`, `plugins/usage-tracking/src/lib/types.ts`, `packages/core/src/lib/agents/agent-slots.ts`, `packages/core/src/lib/scaffold/{detect-existing-install,standalone-core-tools}.ts`, `packages/core/src/lib/shared/{unicode-safe-text,unicode-emoji-names.generated}.ts`, `plugins/error-reporting/**`, `plugins/issues-triage/**`
- **Gate**: type
- acceptance:
  - "Los tipos/constantes exportados se mueven a `contracts/interfaces/*.interface.ts` o `contracts/constants/*.constant.ts` cuando es un contrato real."
  - "Las excepciones legítimas (archivos `*.generated.ts` y constantes locales de servicio) se aceptan con `--update` del baseline, documentando por qué."
  - "`bun run lint:types-in-contracts` sale 0."

### S5 — x00193 S1 huérfano: Node-vs-Bun plugin resolution
- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/ready/x00193-*.md`, `tools/scripts/smoke/cli.script.ts`, `tools/scripts/smoke/pack.script.ts`
- **Gate**: none
- acceptance:
  - "La propuesta x00193 queda coherentemente abierta en `ready/` (ya reabierta; S2 marcado `done`, S1 `pending`)."
  - "Se añade una nota en la propuesta sobre la verificación pendiente bajo Node real (el sandbox no tiene `node`)."
  - "Sin acción de código: es trabajo pendiente documentado, no un cierre falso."
- **Closure note (2026-08-24)**: divergencia intencionada respecto al acceptance original — el sandbox SÍ tiene binario `node` (`/run/user/1000/fnm_multishells/.../bin/node`, v26.5.1), así que x00193 S1 se resolvió de verdad en lugar de dejarse documentado como pendiente. x00193 quedó completada y movida a `review/` (no permanece abierta en `ready/` como asumía el acceptance).

### S6 — `reap-legacy-proposals`: 116 propuestas listas para archivar
- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/**` (116 archivos), `tools/scripts/lint/reap-legacy-proposals.script.ts`
- **Gate**: type
- acceptance:
  - "`bun run lint:reap-legacy-proposals` (dry-run) no lista propuestas pendientes de archivar, o el archivado se aplica con `--apply` y el `closed-frozen-guard` sigue en 0 drift."
  - "El índice queda regenerado sin duplicados ni huérfanos."

### S7 — Código muerto en `proposal-transition.tool.ts`
- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
- **Gate**: type
- acceptance:
  - "Se eliminan o se usan `readPeerReviewLogEntries`, `buildMissingPeerReviewError`, `findLastTransitionToReviewTs`, `hasApprovedPeerReviewSince` y el import `PEER_REVIEW_LOG_RELATIVE_PATH` (funciones definidas y sin llamar)."
  - "`bun run typecheck` y los specs de `proposal-transition` siguen en verde."

## acceptance

- `bun run typecheck` sale 0.
- `bun run lint:solid`, `lint:tools`, `lint:stray-cache-files`, `lint:types-in-contracts`, `lint:file-conventions` salen 0.
- `bun run lint:proposals` y `lint:proposal-slice-completeness` salen 0.
- `bun run test` sale 0.
- `bun run validate` completo termina en verde (sin errores en ninguno de sus pasos).
- Las propuestas `done` no contienen slices `pending` reales (solo auditorías paraguas baselined).
- x00193 permanece abierta en `ready/` con S1 documentado como pendiente.
