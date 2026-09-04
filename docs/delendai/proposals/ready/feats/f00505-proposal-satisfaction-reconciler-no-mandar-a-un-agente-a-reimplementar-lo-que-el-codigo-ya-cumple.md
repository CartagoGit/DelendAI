---
id: f00505
title: "Proposal Satisfaction Reconciler: no mandar a un agente a reimplementar lo que el código ya cumple"
kind: feat
status: ready
type: proposal
track: proposals-integrity
date: 2026-09-04
---

# f00505 — Proposal Satisfaction Reconciler: no mandar a un agente a reimplementar lo que el código ya cumple

## Goal

Antes de asignar una slice pendiente, evaluar su aceptación contra `HEAD` y distinguir el estado *declarado* del estado *observado*. Cuando la evidencia es determinista y el código ya satisface la aceptación, la slice se marca `likely-done` con su evidencia y no se despacha; cuando es ambigua, se marca `verification-needed` y se pide verificación en lugar de reimplementación.

## why

El caso está documentado en el propio repo, no es hipotético. `f00414` declara `S2`, `S3` y `S4` como `pending`, y sus propias notas registran que la implementación aterrizó por trabajo concurrente en `1bc84572c` y `1cadf6d61`, con 45 tests correctos y `Closes #52`. Un agente que lea únicamente el estado declarado enviará a alguien a reimplementar trabajo ya hecho.

El coste de ese fallo es el que este plan intenta eliminar: conflictos en el árbol compartido, tokens gastados en producir un cambio que ya existe y una propuesta que se queda abierta indefinidamente porque nadie distingue "pendiente" de "nadie lo ha marcado". Auditorías anteriores ya encontraron el mismo patrón en lote (`x00155`, veintisiete propuestas con estado desfasado), lo que confirma que es sistémico y no un descuido puntual.

## non-goals

- No cerrar propuestas automáticamente sin evidencia: `likely-done` no es `done`, y el cierre sigue pasando por su puerta de revisión.
- No tocar propuestas archivadas o congeladas — `legacy/closed/` es inmutable y `lint:closed-frozen-guard` lo protege.
- No inferir satisfacción a partir del texto de la aceptación con un LLM: la evidencia debe ser comprobable (símbolos, ficheros, tests que pasan, commits citados).
- No sustituir la revisión por pares.

## Slices

- global_gate: type

### S1 — Evaluador de aceptación contra HEAD
- **Status**: done
- **Files**: `plugins/proposals/src/lib/proposals/satisfaction-evaluator.ts`, `plugins/proposals/tests/src/lib/proposals/satisfaction-evaluator.spec.ts`
- **Gate**: type
- acceptance:
  - "Devuelve estado declarado, estado observado, confianza y la lista de evidencia que lo sostiene."
  - "La evidencia es comprobable: rutas que existen, símbolos presentes, tests que cubren la aceptación o commits citados que la tocan."
  - "Ausencia de evidencia produce `unknown`, nunca `likely-done`: no se inventa satisfacción a partir de un silencio."
  - "Es una función pura sobre un snapshot; no escribe estado."
- review-state: done
- review-implementer: claude-opus-5-f00505
- review-reviewer: reviewer-opus-5-peer
- review-log: approved by reviewer-opus-5-peer — Las cuatro aceptaciones se cumplen. `evaluateSliceSatisfaction` devuelve declared, observed, confidence y la lista de evidencia (ISatisfactionEvidence con kind/supports/detail comprobable a mano: rutas, specs, commits citados). Sin señales de soporte devuelve `unknown`, nunca `likely-done` — hay test explícito. Es una función pura sobre ISliceObservation: sin I/O, sin escritura de estado (la recolección vive aparte). Gate `type` (tsc --noEmit en plugins/proposals) exit 0; satisfaction-evaluator.spec.ts 10/10.
### S2 — Reconciliación antes de despachar la slice
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/lib/auto-work/reconcile-before-dispatch.ts`, `plugins/proposals/tests/src/lib/auto-work/reconcile-before-dispatch.spec.ts`
- **Gate**: type
- acceptance:
  - "Una slice cuyo código ya satisface la aceptación no se entrega a un agente para implementarla."
  - "El resultado indica explícitamente por qué no se despachó y qué evidencia lo respalda."
  - "Un caso ambiguo produce `verification-needed` y una acción de verificación, no de implementación."
  - "Una propuesta archivada o congelada nunca entra en la reconciliación."
- review-state: changes_requested
- review-implementer: claude-opus-5-f00505
- review-reviewer: reviewer-opus-5-peer
- review-log: requested_changes by reviewer-opus-5-peer — Lo entregado no es esta slice. Los **Files** declarados (`plugins/proposals/src/lib/auto-work/reconcile-before-dispatch.ts` y su spec) NO existen en el árbol; en su lugar hay `satisfaction-collector.ts`, que es un recolector de observaciones —la otra mitad de S1—, sin ningún consumidor. Ninguna de las cuatro aceptaciones se cumple: no hay punto de decisión antes del despacho, así que una slice ya satisfecha SÍ se sigue entregando a un agente; no hay resultado que declare por qué no se despachó; no se emite `verification-needed` como acción de verificación (el evaluador produce ese estado, pero nadie lo convierte en una decisión de despacho); y no hay filtro que excluya propuestas archivadas o congeladas de la reconciliación. El contraejemplo documentado en satisfaction-collector.spec.ts ("a spec beside an existing file is NOT enough to withhold a slice", usando x00420 S1) es trabajo de investigación valioso y está bien tenerlo como test, pero demuestra precisamente que el criterio actual no es seguro para retener una slice: es motivo para diseñar mejor la regla de retención, no para dar la slice por entregada. Para cerrar: implementar `reconcile-before-dispatch.ts` con una regla que exija corroboración de commit citado además de ficheros/spec (lo que el propio contraejemplo señala), el guard de archivadas/congeladas, y cablearla en el camino de despacho de auto_work con su spec.
### S3 — Barrido de estado desfasado sobre el tablero
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `plugins/proposals/src/lib/tools/satisfaction-sweep.tool.ts`, `plugins/proposals/tests/src/lib/tools/satisfaction-sweep.tool.spec.ts`
- **Gate**: type
- acceptance:
  - "Una tool lista las slices cuyo estado declarado y observado divergen, ordenadas por confianza."
  - "Declara su `outputSchema` y respeta su presupuesto de tokens."
  - "El barrido es de sólo lectura: propone transiciones, no las aplica."

## acceptance

- Devuelve estado declarado, estado observado, confianza y la lista de evidencia que lo sostiene.
- La evidencia es comprobable: rutas que existen, símbolos presentes, tests que cubren la aceptación o commits citados que la tocan.
- Ausencia de evidencia produce `unknown`, nunca `likely-done`: no se inventa satisfacción a partir de un silencio.
- Es una función pura sobre un snapshot; no escribe estado.
- Una slice cuyo código ya satisface la aceptación no se entrega a un agente para implementarla.
- El resultado indica explícitamente por qué no se despachó y qué evidencia lo respalda.
- Un caso ambiguo produce `verification-needed` y una acción de verificación, no de implementación.
- Una propuesta archivada o congelada nunca entra en la reconciliación.
- Una tool lista las slices cuyo estado declarado y observado divergen, ordenadas por confianza.
- Declara su `outputSchema` y respeta su presupuesto de tokens.
- El barrido es de sólo lectura: propone transiciones, no las aplica.
