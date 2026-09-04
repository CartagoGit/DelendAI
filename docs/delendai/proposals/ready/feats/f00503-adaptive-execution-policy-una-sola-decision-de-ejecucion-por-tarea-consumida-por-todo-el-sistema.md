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
- **Status**: pending
- **Files**: `plugins/agent-orchestrator/src/lib/policy/execution-decision.contract.ts`, `plugins/agent-orchestrator/tests/src/lib/policy/execution-decision.contract.spec.ts`
- **Gate**: type
- acceptance:
  - "`ExecutionDecision` declara ceremonia, ejecución, contexto, validación, respuesta, routing, presupuestos, `confidence` y `reasons`."
  - "Las señales que la alimentan se registran, no se cablean con `if`/`switch` encadenados."
  - "El contrato es serializable y estable: cualquier consumidor puede leerlo sin importar el plugin que lo produjo."

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

### S4 — Receipt de decisión: previsto frente a real
- **Status**: pending
- **DependsOn**: [S3]
- **Files**: `plugins/agent-orchestrator/src/lib/telemetry/decision-receipt.ts`, `plugins/agent-orchestrator/tests/src/lib/telemetry/decision-receipt.spec.ts`
- **Gate**: type
- acceptance:
  - "Cada tarea deja un receipt compacto con la decisión, el coste estimado, el coste real y el resultado."
  - "El receipt guarda características y métricas de la tarea, no prompts completos."
  - "Es la entrada que el autoaprendizaje consumirá después, sin que esta propuesta introduzca aprendizaje alguno."

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
