---
id: f00503
title: "Adaptive Execution Policy: una sola decisión de ejecución por tarea, consumida por todo el sistema"
kind: feat
status: ready
type: proposal
track: execution-policy
date: 2026-09-04
---

# f00503 — Adaptive Execution Policy: una sola decisión de ejecución por tarea, consumida por todo el sistema

## Goal

Introducir una decisión canónica —`ExecutionDecision`— que se toma una vez al empezar cada tarea y que el resto del sistema consume en lugar de volver a clasificar la tarea por su cuenta. La decisión cubre ceremonia (`direct` / `light-plan` / `proposal`), modo de ejecución, política de contexto, política de validación, longitud de respuesta y presupuestos, y viene acompañada de `confidence` y `reasons` explicables.

La regla que gobierna el diseño: `agent-orchestrator` sigue siendo el mecanismo de ejecución. Esta propuesta añade la decisión *previa* sobre qué merece la pena, no un segundo orquestador.

## why

Hoy la clasificación de una tarea se rehace de forma independiente en varios sitios —`proposals`, `agent-orchestrator`, `context-for-change`, la política de validación y los selectores— y cada uno puede llegar a una conclusión distinta. Eso produce decisiones contradictorias, llamadas repetidas y mantenimiento multiplicado.

El efecto práctico más caro es la ceremonia desproporcionada: un typo, un comentario o un rename local acaban recorriendo el ciclo completo de propuesta, cuyo coste de creación y mantenimiento supera con creces el de resolver el problema con seguridad. Al mismo tiempo, no existe el camino intermedio: no hay un `light-plan` para un cambio de tres a diez ficheros que no toma decisiones arquitectónicas.

La inteligencia principal que falta no es hacer más cosas, sino saber cuánto proceso merece cada tarea.

## non-goals

- No construir un segundo orquestador: los modos `single` / `linear` / `swarm` / `auto` siguen siendo de `agent-orchestrator` y esta policy sólo decide cuál pedirle.
- No sustituir `context-for-change` ni la memoria: la policy elige el modo de contexto, no lo produce.
- No exponer razonamiento interno del modelo: `reasons` son códigos y métricas, nunca cadena de pensamiento.
- No permitir que la decisión conceda permisos ni presupuesto que la configuración del usuario no autorice.

## Slices

- global_gate: type

### S1 — Contrato ExecutionDecision y su registro de señales
- **Status**: done
- **Files**: `plugins/agent-orchestrator/src/lib/policy/execution-decision.contract.ts`, `plugins/agent-orchestrator/tests/src/lib/policy/execution-decision.contract.spec.ts`
- **Gate**: type
- acceptance:
  - "`ExecutionDecision` declara ceremonia, ejecución, contexto, validación, respuesta, routing, presupuestos, `confidence` y `reasons`."
  - "Las señales que la alimentan se registran, no se cablean con `if`/`switch` encadenados."
  - "El contrato es serializable y estable: cualquier consumidor puede leerlo sin importar el plugin que lo produjo."
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: reviewer-adaptive-policy
- review-log: approved by reviewer-adaptive-policy — Las tres aceptaciones se cumplen de verdad. `IExecutionDecision` declara ceremony/execution/context/validation/response/route/budgets/confidence/reasons/overrides. Las señales entran por `SignalRegistry` (register + collect, ids únicos, orden de registro reproducible, una fuente que lanza se degrada a un signal `signal-source-failed` en vez de tumbar la decisión): es un registro real, no una cadena de if. Serializable por construcción y con `isExecutionDecision` como guard, con test de round-trip JSON y batería de formas inválidas. `exactOptionalPropertyTypes` bien manejado (`facts?: ... | undefined`). Gate type (tsc --noEmit -p plugins/agent-orchestrator) exit 0; 269 tests ejecutados y pasando en el paquete.

Defectos que no bloquean pero conviene anotar: (1) `isExecutionDecision` no valida rangos — acepta `weight: 100` o `maxConcurrentAgents: -5`, mientras que sí valida `confidence` en 0..1; el comentario dice que la decisión "se comprueba en vez de confiarse", y ahí confía. (2) `SignalRegistry` no tiene ningún consumidor en `src/` todavía: la costura existe pero nadie se registra en producción. (3) El paquete tiene la suite roja por `tests/src/lib/telemetry/decision-receipt.spec.ts`, que importa un módulo (S4) que no existe: 1 de 27 ficheros de test no colecciona. Es de S4, no de S1, pero deja el paquete en rojo y habría que arreglarlo o retirar el spec.
### S2 — Clasificador de ceremonia con reglas duras y reason codes
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/agent-orchestrator/src/lib/classifier/ceremony-classifier.ts`, `plugins/agent-orchestrator/tests/src/lib/classifier/ceremony-classifier.spec.ts`
- **Gate**: type
- acceptance:
  - "Puntua la necesidad de propuesta a partir de impacto arquitectónico, contrato público, incertidumbre, número de subsistemas, riesgo de migración y de reversión, frente a localidad y trivialidad."
  - "Reglas duras que fuerzan `proposal` con independencia de la puntuación: frontera de seguridad, migración de formato persistente y diagrama de contratos públicos."
  - "Reglas duras que fuerzan `direct`: un solo subsistema local, reversible y con regresión identificada."
  - "Toda decisión emite `reasons` legibles; ninguna es una suma opaca."
- review-state: changes_requested
- review-implementer: claude-opus-5
- review-reviewer: reviewer-adaptive-policy
- review-log: requested_changes by reviewer-adaptive-policy — Dos de las cuatro aceptaciones están declaradas pero no cubiertas por código, sólo por objetos que el propio test fabrica.

1) "Reglas duras que fuerzan `proposal`: frontera de seguridad, migración de formato persistente y diagrama de contratos públicos" y "Reglas duras que fuerzan `direct`: un solo subsistema local, reversible y con regresión identificada". `ceremony-classifier.ts` no contiene ninguna de esas seis reglas. Sólo sabe elegir entre `IExecutionOverride` que le llegan ya construidos (`decisiveOverride`). En el spec los overrides se inventan a mano — `override('proposal', 'security-boundary')`, `override('direct', 'local-reversible-identified')` — así que lo verificado es "si alguien me pasa un override llamado security-boundary, lo respeto", no "cruzar una frontera de seguridad fuerza propuesta". Nadie en `src/` produce esos overrides (grep de `ISignalSource`/`SignalRegistry` en plugins: cero implementaciones de producción), y no hay slice posterior en f00503 que los vaya a producir — S3 consume y S4 es el receipt. Tal como está, el clasificador nunca puede llegar a las reglas duras que su aceptación promete.

2) "Puntúa la necesidad de propuesta a partir de impacto arquitectónico, contrato público, incertidumbre, número de subsistemas, riesgo de migración y de reversión, frente a localidad y trivialidad". El clasificador es agnóstico a esas dimensiones: suma pesos con direcciones. Las seis dimensiones aparecen únicamente como strings inventados en el `code` de los signals del test (`toward(0.9, 'architectural')`, `against(0.9, 'single-file')`). Cambiar esos strings por `foo`/`bar` no rompe ni un test.

3) Defecto de comportamiento, independiente de lo anterior: `decisionConfidence` sólo mira `signals` e ignora `overrides` por completo. `classifyCeremony({signals: [], overrides: [override('proposal')]})` devuelve `ceremony: 'proposal'`, `reviewQuorum: 3` y `confidence: 0` — y el propio contrato dice que confianza baja es motivo para preguntar en vez de actuar. La decisión más certera que el sistema puede tomar (una regla dura) se reporta como la menos fiable. El test 'carries the quorum onto the decision budgets' construye exactamente ese caso y no comprueba la confianza.

4) Números mágicos sin justificar: `PROPOSAL_AT = 0.5`, `LIGHT_PLAN_AT = 0.1`, el `mass / 2` de saturación de evidencia y el `0.4 + 0.6 * agreement`. El módulo justifica bien el quorum y la asimetría de los overrides, pero estos cinco no tienen ni comentario ni test que ancle el porqué; y el 0.5/0.1 es lo que decide si un cambio va a propuesta.

5) Menor: asimetría no explicada en `budgetsFor` — `maxConcurrentAgents` trata la config como techo (`Math.min`), pero `reviewQuorum` la trata como override absoluto (`limits.reviewQuorum ?? ...`), de modo que la config puede bajar a 1 el quorum de 3 que fijó una regla dura de seguridad. Puede ser lo que se quiere, pero hoy no lo dice nadie.

Para cerrar: implementar en producción, con sus specs, al menos las señales y las reglas duras que la aceptación nombra (aunque sea un `ISignalSource` por dimensión sobre `ITaskObservation`), o enmendar la aceptación de forma explícita como se hizo en f00505 S3 diciendo qué se difiere y a qué slice; y decidir qué confianza reporta una decisión forzada por regla dura.
### S3 — El orquestador consume la decisión en lugar de reclasificar
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `plugins/agent-orchestrator/src/lib/policy/policy.ts`, `plugins/agent-orchestrator/src/lib/tools/execution-policy.tool.ts`
- **Gate**: type
- acceptance:
  - "El modo de ejecución se toma de la decisión, no de una segunda clasificación interna."
  - "Delegar a subagentes exige beneficio esperado por encima del coste de coordinación; dos investigadores que leerían los mismos ficheros no se lanzan."
  - "Los modos de configuración `adaptive` / `always` / `never` / `manual` se respetan como restricción, no como sugerencia."
  - "El plugin declara la tool con su `outputSchema` y su presupuesto en TOKEN-BUDGETS."
- review-state: changes_requested
- review-implementer: claude-opus-5
- review-reviewer: reviewer-adaptive-policy
- review-log: requested_changes by reviewer-adaptive-policy — El título de la slice es "El orquestador consume la decisión en lugar de reclasificar", y el orquestador sigue reclasificando exactamente igual que antes.

1) Ninguno de los dos **Files** declarados se tocó. `plugins/agent-orchestrator/src/lib/policy/policy.ts` está sin cambios desde antes de f00503 (`git log -- policy.ts`: último commit funcional es 2a7c8c71e, anterior a la propuesta); sigue resolviendo el modo con `this.#policy.defaultMode` y cayendo a `AutoModeAdapter`, que enruta por `TaskClassifier`. El parámetro `_classifier` del constructor sigue sin usarse. `plugins/agent-orchestrator/src/lib/tools/execution-policy.tool.ts` no existe (el directorio `tools/` tiene dispatch/plan/telemetry y nada más). Lo entregado es `policy/decision-to-plan.ts`, un fichero nuevo que la slice no declaraba.

2) Aceptación "El modo de ejecución se toma de la decisión, no de una segunda clasificación interna": no se cumple. `resolveExecutionMode` está bien escrita, pero no la llama nadie en `src/` — sólo su propio spec. Con ella dentro del árbol y `TaskClassifier` aún en el camino real, el resultado es justo la situación que el header del módulo describe como bug: dos clasificadores que pueden discrepar, sólo que ahora uno de ellos no se ejecuta nunca.

3) Aceptación "El plugin declara la tool con su `outputSchema` y su presupuesto en TOKEN-BUDGETS": no se cumple, y a diferencia de f00505 S3 la desviación no está documentada en ninguna parte. No hay tool, no hay outputSchema, y grep de `execution-policy` en `docs/` y `tools/` no devuelve ninguna entrada de presupuesto. Si la decisión fue no añadir tool (razonable, y es el mismo argumento que se aceptó en f00505), tiene que quedar escrita como enmienda en la propuesta, no simplemente omitida.

4) Aceptación "Delegar a subagentes exige beneficio esperado por encima del coste de coordinación": la función `shouldDelegate` la implementa correctamente y está bien testeada, pero al no tener llamador, ninguna delegación real del sistema pasa hoy por esa comprobación. Lo mismo con "los modos `adaptive`/`always`/`never`/`manual` se respetan como restricción": `TDelegationMode` es un tipo nuevo que ninguna configuración produce ni consume; no está conectado a `IOrchestratorPolicy`.

5) `COORDINATION_COST_PER_PART = 0.35` y `MIN_USEFUL_DISJOINTNESS = 0.5` son números mágicos con prosa alrededor pero sin nada que los ancle: con 0.35, dos partes con disjointness 0.5 dan neto exactamente 0.15 y delegan, y con 0.36 no. El umbral que decide si se lanza un segundo agente merece una justificación medida o al menos un test que fije el caso frontera.

6) La suite del paquete está roja: `tests/src/lib/telemetry/decision-receipt.spec.ts` importa `src/lib/telemetry/decision-receipt`, que no existe. Es S4, pero se commiteó un spec sin su módulo y eso deja `bunx vitest run --root plugins/agent-orchestrator` en 1 fichero fallido de 27 (269 tests pasan). El gate `type` sí pasa (exit 0).

Para cerrar: cablear `resolveExecutionMode` en `OrchestratorEngine.plan` de modo que el modo salga de la `IExecutionDecision` y `TaskClassifier` deje de ser el camino por defecto (o quede como fallback explícito y testeado), conectar `TDelegationMode` a la política real del plugin, y o bien añadir la tool con su outputSchema y su presupuesto o dejar la enmienda escrita en f00503 explicando por qué no.
### S4 — Receipt de decisión: previsto frente a real
- **Status**: pending
- **DependsOn**: [S3]
- **Files**: `plugins/agent-orchestrator/src/lib/telemetry/decision-receipt.ts`, `plugins/agent-orchestrator/tests/src/lib/telemetry/decision-receipt.spec.ts`
- **Gate**: type
- acceptance:
  - "Cada tarea deja un receipt compacto con la decisión, el coste estimado, el coste real y el resultado."
  - "El receipt guarda características y métricas de la tarea, no prompts completos."
  - "Es la entrada que el autoaprendizaje consumirá después, sin que esta propuesta introduzca aprendizaje alguno."
- review-state: in_review
- review-implementer: claude-opus-5
## acceptance

- `ExecutionDecision` declara ceremonia, ejecución, contexto, validación, respuesta, routing, presupuestos, `confidence` y `reasons`.
- Las señales que la alimentan se registran, no se cablean con `if`/`switch` encadenados.
- El contrato es serializable y estable: cualquier consumidor puede leerlo sin importar el plugin que lo produjo.
- Puntua la necesidad de propuesta a partir de impacto arquitectónico, contrato público, incertidumbre, número de subsistemas, riesgo de migración y de reversión, frente a localidad y trivialidad.
- Reglas duras que fuerzan `proposal` con independencia de la puntuación: frontera de seguridad, migración de formato persistente y diagrama de contratos públicos.
- Reglas duras que fuerzan `direct`: un solo subsistema local, reversible y con regresión identificada.
- Toda decisión emite `reasons` legibles; ninguna es una suma opaca.
- El modo de ejecución se toma de la decisión, no de una segunda clasificación interna.
- Delegar a subagentes exige beneficio esperado por encima del coste de coordinación; dos investigadores que leerían los mismos ficheros no se lanzan.
- Los modos de configuración `adaptive` / `always` / `never` / `manual` se respetan como restricción, no como sugerencia.
- El plugin declara la tool con su `outputSchema` y su presupuesto en TOKEN-BUDGETS.
- Cada tarea deja un receipt compacto con la decisión, el coste estimado, el coste real y el resultado.
- El receipt guarda características y métricas de la tarea, no prompts completos.
- Es la entrada que el autoaprendizaje consumirá después, sin que esta propuesta introduzca aprendizaje alguno.
