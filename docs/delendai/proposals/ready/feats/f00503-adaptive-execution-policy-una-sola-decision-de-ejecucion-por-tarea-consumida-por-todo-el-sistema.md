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
- review-state: in_review
- review-implementer: claude-opus-5
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
- review-state: in_review
- review-implementer: claude-opus-5
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
