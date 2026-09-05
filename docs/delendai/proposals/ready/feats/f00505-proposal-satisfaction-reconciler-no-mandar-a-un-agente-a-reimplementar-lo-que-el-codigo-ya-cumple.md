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
- **Files**: `plugins/proposals/src/lib/proposals/satisfaction-sweep.ts`, `plugins/proposals/tests/src/lib/proposals/satisfaction-sweep.spec.ts`
- **Gate**: type
- acceptance:
  - "El barrido lista las slices cuyo estado declarado y observado divergen, ordenadas por confianza."
  - "Se expone como un modo de la superficie de diagnóstico ya existente, no como una tool nueva."
  - "El barrido es de sólo lectura: propone transiciones, no las aplica."
  - "Usa el mismo umbral de confianza con el que el reconciliador retiene, de modo que tablero y despacho no puedan contradecirse."

> **Enmienda (2026-09-05): el barrido no añade una tool.** La redacción
> original pedía una tool propia con su `outputSchema` y su presupuesto. La
> auditoría externa midió que los output schemas son el coste dominante de la
> superficie nativa, y que `proposals` ya representa por sí solo entre el 20 %
> y el 26 % de esa superficie con 34 tools. Añadir la número 35 para una
> consulta de diagnóstico contradice directamente el hallazgo más fuerte de la
> auditoría, y lo haría en el plugin que más pesa.
>
> La sustancia del slice —el barrido puro, ordenado por confianza, de sólo
> lectura— se entrega igual. Lo que cambia es cómo se alcanza: como un modo de
> la superficie de diagnóstico que ya existe, que es donde un operador
> pregunta este tipo de cosas de todas formas.
>
> Se añade además una aceptación que el texto original no tenía y que importa:
> el umbral de confianza del barrido es el MISMO con el que S2 retiene. Con dos
> umbrales distintos, el tablero podría recomendar cerrar una slice que el
> despacho sigue repartiendo, y quien leyera ambos no tendría forma de saber
> cuál está mal.

### S4 — Propagar los commits citados al plan, y sólo entonces cablear la retención

- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `plugins/proposals/src/lib/tools/auto-work.tool.ts`, `plugins/proposals/tests/src/lib/tools/auto-work-reconciliation.spec.ts`
- **Gate**: type
- acceptance:
  - "El plan que consume `resolveClaimReady` incluye, por slice, los hashes de commit que la propuesta cita, extraídos del propio documento."
  - "`auto_work` consulta la reconciliación antes de ofrecer una slice y no la ofrece cuando la decisión es retenerla."
  - "Una slice retenida se comunica con su motivo y su evidencia, de forma que un humano pueda comprobarla y marcarla done."
  - "Un despacho para verificación llega al agente como tal, con instrucción de comprobar antes de escribir."

> **Por qué esto es una slice y no parte de S2.** La decisión de S2 sólo
> retiene con confianza 0.95, y el evaluador únicamente concede 0.95 cuando
> hay dos corroboraciones: tests que cubren los ficheros Y un commit citado.
> El payload del plan que hoy consume `resolveClaimReady` no lleva los
> commits citados por ninguna parte — `extractCitedHashes` existe, pero vive
> en `tools/scripts/lint/` y un plugin no puede depender de ahí. Cablear la
> reconciliación antes de propagar esas citas no retendría ni una sola
> slice: sería código muerto con coste de mantenimiento y una garantía
> aparente que no se cumple. El orden correcto es propagar primero y cablear
> después, y separarlo lo hace verificable en vez de dejarlo implícito.
- review-state: in_review
- review-implementer: claude-opus-5
### S5 — `close_slice` deja constancia del commit que entregó la slice

- **Status**: pending
- **DependsOn**: [S4]
- **Files**: `plugins/proposals/src/lib/swarm/slice-shipping-record.ts`, `plugins/proposals/tests/src/lib/swarm/slice-shipping-record.spec.ts`
- **Gate**: type
- acceptance:
  - "Al cerrar una slice se registra en su bloque el commit que la entregó, en el formato de cita que el repositorio ya usa."
  - "La constancia se escribe una sola vez por cierre y no se duplica si el cierre se repite."
  - "Una slice cerrada sin commit conocido lo dice explícitamente en vez de omitir la línea en silencio."
  - "Las citas escritas por esta slice las lee `S4` sin ninguna traducción intermedia."

> **Por qué esta slice existe: la medida que la obliga.** Al implementar S4
> medí la cobertura real de citas sobre todo el corpus del repositorio: de
> 1.445 slices en 599 propuestas, sólo **41 citan un commit — un 2,8 %**, y
> están concentradas en 13 propuestas. El extractor de S4 es correcto y
> necesario, pero la retención de S2 exige confianza 0,95, que a su vez exige
> una cita; con esta cobertura el reconciliador podría retener, como mucho, el
> 2,8 % de las slices, y sólo aquellas que además tengan todos sus ficheros
> trackeados y un spec que las cubra.
>
> Es decir: el cuello de botella no es leer las citas, es que casi no existen.
> Y no existen porque nada las escribe — se ponen a mano cuando alguien se
> acuerda. Mientras eso no cambie, cablear la supresión entregaría un
> mecanismo que casi nunca dispara y que hay que mantener igual.
>
> El orden correcto es al revés del que parecía: primero que el cierre de una
> slice deje la constancia, y la retención se vuelve útil sola, según el
> corpus se llene. Los casos que motivaron toda la propuesta —x00419 con sus
> siete slices ya implementadas y declaradas `pending`— son exactamente los
> que habrían quedado registrados si el cierre hubiese dejado su huella.
- review-state: in_review
- review-implementer: claude-opus-5
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
