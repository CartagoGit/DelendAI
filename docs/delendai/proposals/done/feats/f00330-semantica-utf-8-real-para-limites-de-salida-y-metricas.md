---
id: f00330
title: "Semántica UTF-8 real para límites de salida y métricas"
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#utf-8
last-transition-id: 064bca27-741e-4507-bd79-e00ab65b8ee8
last-correlation-id: 064bca27-741e-4507-bd79-e00ab65b8ee8
last-transition-from: in-progress
---

# f00330 — Semántica UTF-8 real para límites de salida y métricas

## Goal

Hacer explícita y verificable la semántica de bytes reales UTF-8 en dos superficies compartidas del core: el límite de salida de procesos y la estimación de coste de respuestas. El comportamiento esperado es contar bytes reales, truncar al presupuesto exacto sin romper caracteres multibyte y mantener métricas coherentes para texto y contenido estructurado.

## why

El item migrado provenía de un audit con dos hallazgos concretos: `maxOutputBytes` debía operar sobre bytes reales y `estimateResultBytes` debía medir texto con `Buffer.byteLength(text, 'utf8')`. Si estos contratos quedan implícitos, reaparecen regresiones sutiles: límites que cortan por code units en vez de bytes, caracteres reemplazados por truncado inválido y métricas de coste que subestiman respuestas multibyte.

## non-goals

- Rediseñar la política de timeouts, kill del árbol de procesos o semántica general de `runArgv` fuera del presupuesto UTF-8.
- Cambiar el modelo de costes más allá de medir correctamente bytes de texto y su agregación inmediata.
- Reabrir el audit original como documento vivo independiente.

## architecture

El alcance se divide en dos dueños claros:

- El runner compartido de procesos debe aplicar `maxOutputBytes` como presupuesto combinado sobre bytes UTF-8 reales y truncar sin dejar artefactos de decodificación.
- El registro de métricas debe calcular bytes de texto con `Buffer.byteLength(..., 'utf8')` y propagar ese coste a los agregados públicos y a los consumidores que reportan `responseBytes`.

## Slices

### S1 — Runner de procesos con presupuesto real de bytes

- **Status**: done
- **Files**: `packages/core/src/lib/shared/run-command.ts`, `packages/core/src/lib/contracts/interfaces/run-command.interface.ts`, `packages/core/tests/src/lib/shared/run-command-bytes.spec.ts`
- **Gate**: `vitest packages/core/tests/src/lib/shared/run-command-bytes.spec.ts`
- acceptance:
  - "`maxOutputBytes` cuenta bytes UTF-8 reales, no code units UTF-16."
  - "El presupuesto combinado stdout+stderr se respeta incluso cuando el corte cae dentro de un carácter multibyte."
  - "La truncación toma exactamente los bytes restantes sin introducir `\uFFFD` cuando existe un prefijo UTF-8 válido recuperable."
  - "La interfaz pública documenta con claridad la semántica de bytes para `maxOutputBytes` y presupuestos por stream."
- review-state: done
- review-implementer: sonnet-worker-migrated
- review-reviewer: sonnet-verifier-migrated
- review-log: approved by sonnet-verifier-migrated — Ran npx vitest run packages/core/tests/src/lib/shared/run-command-bytes.spec.ts -> passing. Confirms S1 acceptance bullets already implemented.
### S2 — Métricas de respuesta medidas en bytes UTF-8 reales

- **Status**: done
- **Files**: `packages/core/src/lib/metrics/metrics-registry.ts`, `packages/core/tests/src/lib/metrics/bytes-and-errors.spec.ts`, `packages/core/tests/src/lib/metrics/metrics.spec.ts`, `plugins/usage-tracking/src/index.ts`
- **Gate**: `vitest packages/core/tests/src/lib/metrics/bytes-and-errors.spec.ts packages/core/tests/src/lib/metrics/metrics.spec.ts`
- acceptance:
  - "`estimateResultBytes` suma texto con `Buffer.byteLength(text, 'utf8')`."
  - "`estimateResultCost` separa bytes de texto y bytes JSON estructurados sin subcontar contenido multibyte."
  - "Los agregados de métricas y los consumidores inmediatos preservan el mismo contrato de `responseBytes`."
  - "Las pruebas cubren texto multibyte y demuestran que el coste no cae artificialmente a cero por usar longitud UTF-16."
- review-state: done
- review-implementer: sonnet-worker-migrated
- review-reviewer: sonnet-verifier-migrated
- review-log: approved by sonnet-verifier-migrated — Ran npx vitest run packages/core/tests/src/lib/shared/run-command-bytes.spec.ts packages/core/tests/src/lib/metrics/bytes-and-errors.spec.ts packages/core/tests/src/lib/metrics/metrics.spec.ts -> 3 files, 32 tests passing. Confirmed source implements exact acceptance bullets: Buffer.byteLength utf8 in run-command.ts and metrics-registry.ts, multibyte-safe truncation, contentTextBytes/structuredJsonBytes/wireEstimateBytes separation.
## acceptance

- El runner compartido de procesos aplica `maxOutputBytes` sobre bytes UTF-8 reales y respeta el presupuesto combinado stdout+stderr.
- La truncación de salida no rompe caracteres multibyte ni deja artefactos de reemplazo cuando existe un prefijo válido representable.
- `estimateResultBytes` y el coste público asociado usan bytes UTF-8 reales para texto multibyte.
- Las métricas distinguen con claridad texto y JSON estructurado sin subcontar respuestas.
- Los tests de proceso y métricas cubren los casos multibyte que originaron el hallazgo migrado.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#utf-8` by `proposal_adopt` (f00116).
- El source real se pudo recuperar desde git history en `e83d7da0f`; de ahí salen los dos subtemas accionables de esta propuesta: PR-001 para `maxOutputBytes` y MET-001 para `estimateResultBytes`.
- Se preserva el historial de revisión previo sin cerrarlo ni alterarlo: `review-state: done`, `review-implementer: copilot-orchestrator-bulk-retire-placeholders`, `review-reviewer: delivery-verifier-bulk-retire-placeholders`.
- La reapertura de 2026-09-01 corrige la premisa errónea de que el source había desaparecido; el objetivo de esta edición es dejar la propuesta en formato canónico y con alcance verificable, no resolver su workflow.
