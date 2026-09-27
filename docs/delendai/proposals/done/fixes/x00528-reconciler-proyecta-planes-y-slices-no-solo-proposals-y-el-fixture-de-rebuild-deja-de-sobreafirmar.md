---
id: x00528
title: "Reconciler proyecta planes y slices, no solo proposals — y el fixture de rebuild deja de sobreafirmar"
kind: fix
status: review
type: proposal
track: architecture
date: 2026-09-08
last-transition-id: f5144e6a-2d44-4ba1-b35a-de0efe186365
last-correlation-id: f5144e6a-2d44-4ba1-b35a-de0efe186365
last-transition-from: in-progress
---

# x00528 — Reconciler proyecta planes y slices, no solo proposals — y el fixture de rebuild deja de sobreafirmar

## Goal

Hacer que el pipeline de reconciliacion de @delendai/proposals-sqlite reconstruya las TRES entidades (proposals, plans, slices) desde markdown, y que el fixture del gate de rebuild determinista cubra realmente lo que la aceptacion de a00094 dice cubrir.

## why

Auditoria 2026-09-08 sobre 6a5a9e5. reconciler-markdown.ts devuelve IReconcileResult con un unico campo de entidades: proposals. reconciler-staging.ts solo instancia ProposalRepo. reconciler-apply-candidate.ts solo hace SELECT/INSERT sobre la tabla proposals. Las tablas plans y slices existen desde 0001_initial.sql, tienen triggers de paridad closed_at en 0008 y tablas FTS en 0010, y el reconciliador no las toca. Consecuencia: reconstruir la DB desde markdown pierde toda la estructura plan/slice, asi que la propiedad rm-db + reconcile == mismo estado logico solo se cumple para un subconjunto del dominio. Ademas a00094 (cerrada) afirma en su aceptacion un fixture de 50+ proposals, plans and slices, pero packages/proposals-sqlite/tests/fixtures/large-proposal-set.ts son 22 lineas que generan 60 proposals identicas de kind fix y status ready, sin planes, sin slices, sin transiciones y sin entradas corruptas. Ese test es el gate obligatorio delendai-rebuild-digest de ci.yml, o sea que hoy CI certifica en verde una propiedad mas estrecha que la que su nombre promete. Sin esto no se puede evaluar q00022 S4 ni el cutover a SQLite.

## non-goals

- No cablear todavia el plugin proposals a la DB (eso es q00022 S4).
- No borrar ningun INDEX.json (eso es Phase D, ver r00049).
- No cambiar el formato del logical digest mas alla de incorporar las entidades nuevas.

## Slices

- global_gate: type

### S1 — reconciler-markdown proyecta plans y slices ademas de proposals
- **Status**: done
- **Files**: `packages/proposals-sqlite/src/lib/reconciler-markdown.ts`, `packages/proposals-sqlite/src/lib/identity.ts`, `packages/proposals-sqlite/src/lib/markdown-parser.ts`, `packages/proposals-sqlite/tests/src/lib/reconciler.spec.ts`
- **Gate**: type
- acceptance:
  - "IReconcileResult expone plans e slices ademas de proposals y quarantined."
  - "Un fichero de plan (kind plan) con seccion Slices produce una fila de plan y una fila por cada slice declarada, con uid estable proposalUid.sliceId."
  - "El logical digest incorpora plans y slices y sigue siendo independiente del orden de lectura de ficheros."
  - "Un markdown sin seccion Slices produce cero slices y no falla."
  - "bun run typecheck verde."
- review-state: done
- review-implementer: claude-opus-5-implementer
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Focused reconciler suite passes; plans and slices are included in the deterministic digest.
### S2 — staging y apply persisten las tres entidades de forma transaccional
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `packages/proposals-sqlite/src/lib/reconciler-staging.ts`, `packages/proposals-sqlite/src/lib/reconciler-apply-candidate.ts`, `packages/proposals-sqlite/tests/src/lib/reconciler-staging.spec.ts`, `packages/proposals-sqlite/tests/src/lib/reconciler-apply-candidate.spec.ts`
- **Gate**: type
- acceptance:
  - "reconcileShadowToStaging escribe proposals, plans y slices en la staging DB usando ProposalRepo, PlanRepo y SliceRepo."
  - "applyValidatedCandidate compara y aplica las tres tablas dentro de UNA transaccion IMMEDIATE; un fallo en cualquiera deja la DB activa byte-identica."
  - "Los triggers de paridad closed_at de 0008 se respetan: cerrar un plan en markdown produce closed_at no nulo en la fila."
  - "integrity_check y foreign_key_check siguen en ok tras aplicar."
- review-state: done
- review-implementer: Zhou
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Staging and active promotion tests pass 8/8 with three-entity transactional behavior.
### S3 — fixture representativo y correccion de la aceptacion sobreafirmada de a00094
- **Status**: done
- **DependsOn**: [S2]
- **Files**: `packages/proposals-sqlite/tests/fixtures/large-proposal-set.ts`, `packages/proposals-sqlite/tests/e2e/digest-rebuild.spec.ts`, `docs/delendai/proposals/done/audits/a00094-audit-acceptance-rm-sqlite-reconcile-returns-the-same-logical-digest.md`
- **Gate**: e2e
- acceptance:
  - "El fixture contiene al menos 50 proposals de varios kind y varios status, al menos 5 planes con slices, al menos una entidad cerrada con closed_at, y al menos una entrada corrupta que debe ir a quarantine."
  - "El e2e de rebuild borra la DB activa, reconstruye 100 veces y obtiene digest identico incluyendo plans y slices."
  - "a00094 lleva una nota de correccion que dice explicitamente que su fixture original solo cubria proposals planas y que esta propuesta cierra la brecha; no se reabre a00094, se anota."
  - "El gate delendai-rebuild-digest sigue verde."
- review-state: done
- review-implementer: Shang
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — The widened rebuild fixture and E2E gate satisfy every declared S3 criterion.
## acceptance

- IReconcileResult expone plans e slices ademas de proposals y quarantined.
- Un fichero de plan (kind plan) con seccion Slices produce una fila de plan y una fila por cada slice declarada, con uid estable proposalUid.sliceId.
- El logical digest incorpora plans y slices y sigue siendo independiente del orden de lectura de ficheros.
- Un markdown sin seccion Slices produce cero slices y no falla.
- bun run typecheck verde.
- reconcileShadowToStaging escribe proposals, plans y slices en la staging DB usando ProposalRepo, PlanRepo y SliceRepo.
- applyValidatedCandidate compara y aplica las tres tablas dentro de UNA transaccion IMMEDIATE; un fallo en cualquiera deja la DB activa byte-identica.
- Los triggers de paridad closed_at de 0008 se respetan: cerrar un plan en markdown produce closed_at no nulo en la fila.
- integrity_check y foreign_key_check siguen en ok tras aplicar.
- El fixture contiene al menos 50 proposals de varios kind y varios status, al menos 5 planes con slices, al menos una entidad cerrada con closed_at, y al menos una entrada corrupta que debe ir a quarantine.
- El e2e de rebuild borra la DB activa, reconstruye 100 veces y obtiene digest identico incluyendo plans y slices.
- a00094 lleva una nota de correccion que dice explicitamente que su fixture original solo cubria proposals planas y que esta propuesta cierra la brecha; no se reabre a00094, se anota.
- El gate delendai-rebuild-digest sigue verde.
