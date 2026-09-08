---
id: x00538
title: "Los tests de aislamiento entre agentes de commit-policy llevan rojos desde el 7 de septiembre y ningun gate lo dijo"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-09-08
---

# x00538 — Los tests de aislamiento entre agentes de commit-policy llevan rojos desde el 7 de septiembre y ningun gate lo dijo

## Goal

Devolver a verde los 8 tests de aislamiento cross-agent de commit-policy, y averiguar por que el job tests de CI no marco en rojo develop durante mas de un dia.

## why

Encontrado el 2026-09-08 auditando develop. bunx vitest run --project commit-policy da hoy 3 ficheros y 8 tests en rojo: cinco en tests/integration/cross-agent.spec.ts y tres en tests/integration/cross-agent-real.spec.ts. Los sintomas son de comportamiento, no de resolucion de modulos: 'commits only B files when A already has staged work in the same repo' espera committedFiles ['b.ts'] y recibe [], con statusAfter ganando '?? b.ts', es decir que el fichero nunca llego a staged; otro espera 2 commits y obtiene 1; otro espera que dos sha de HEAD difieran y son identicos. NO es una regresion del trabajo de hoy. La evidencia: el spec y sus snapshots inline no se tocan desde 2a7c8c71e del 2026-09-04, mientras que plugins/commit-policy/src/lib/services/commit-driver.ts cambio despues, en 568e5f411 del 2026-09-07, con el mensaje 'fix(commit-policy): scope slice commits strictly'. Ese commit elimino la variable scopeSliceCommit y con ella la condicionalidad del rechazo: antes, un sliceContext con files vacio solo se rechazaba con SLICE_HAS_NO_FILES cuando sliceScoping estaba activo y allowForeignChanges desactivado, y existia una rama separada WORKSPACE_HAS_NO_FILES para el caso contrario; ahora el rechazo es incondicional y la rama WORKSPACE_HAS_NO_FILES desaparecio. Lo segundo es lo que mas preocupa: el job tests de ci.yml ejecuta bun run test, que es vitest run sobre todos los proyectos, incluidos estos integration specs. Deberia haber puesto develop en rojo el 7 de septiembre. CORRECCION (misma sesion, tras consultar la API de Actions): la hipotesis inicial de esta propuesta era que cancel-in-progress cancelaba las ejecuciones antes de terminar. Es FALSA y queda desmentida por los datos. De las 100 ultimas ejecuciones del workflow 296463640 sobre develop, 85 son failure, 14 success y solo 1 cancelled. La causa real es peor: ci.yml estaba sintacticamente valido pero SEMANTICAMENTE invalido para Actions desde el commit 82268fb65 del 2026-09-07T23:01Z, asi que GitHub rechazaba el fichero entero y no ejecutaba NINGUN job. Las 42 ejecuciones posteriores figuran con el nombre crudo '.github/workflows/ci.yml' en vez de 'CI', que es lo que GitHub muestra cuando no puede parsear el fichero para leer su name, y todas terminaron en failure con cero jobs. La ultima ejecucion que llego a correr algun job fue 1bc6b6b6a a las 22:57Z del dia anterior. Corregido en 8f657e49a, junto con las dos reglas nuevas de lint:workflow-yaml que lo habrian detectado. Por tanto estos ocho tests no pusieron develop en rojo no porque el rojo se cancelase, sino porque durante diecisiete horas no se ejecuto absolutamente nada. La leccion es la misma que x00534: la ausencia de rojo era ausencia de informacion, no evidencia de salud. El area afectada es precisamente la que protege al enjambre de pisarse entre agentes.

## non-goals

- No revertir 568e5f411 a ciegas: el endurecimiento del scoping puede ser correcto y ser el test el que este desactualizado. Hay que decidirlo con lectura, no por color.
- No desactivar cancel-in-progress sin medir el coste en minutos de CI.

## Slices

- global_gate: type

### S1 — decidir si la verdad es el test o el codigo, y dejar los ocho en verde
- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/services/commit-driver.ts`, `plugins/commit-policy/tests/integration/cross-agent.spec.ts`, `plugins/commit-policy/tests/integration/cross-agent-real.spec.ts`
- **Gate**: type
- acceptance:
  - "La propuesta registra explicitamente cual de las dos era la verdad: si el rechazo incondicional de 568e5f411 es el comportamiento deseado, los tests y sus snapshots se actualizan explicando por que; si no lo es, se restaura la condicionalidad y se explica que caso legitimo rompia."
  - "Si se restaura la rama WORKSPACE_HAS_NO_FILES, queda cubierta por un test propio; si se elimina definitivamente, ninguna referencia a ese codigo de rechazo sobrevive en codigo, tipos ni documentacion."
  - "Las suites cross-agent controlada y Git real pasan 8/8 tests, y el typecheck focalizado de commit-policy pasa."
  - "Ningun snapshot se actualiza a ciegas con -u sin una frase que justifique el nuevo valor."
- review-state: done
- review-implementer: delendai-impl-20260908
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Aprobación independiente de S1 tras alinear la propuesta. La decisión técnica es mantener scoping estricto e incondicional para slices mediante índice aislado; esto evita incorporar staging de otros agentes y permite commits concurrentes disjuntos. La rama WORKSPACE_HAS_NO_FILES no se restaura en el driver. El gate global de 47 archivos queda explícitamente reservado al cierre de x00538, no bloquea esta slice.
### S2 — un job rojo no puede desaparecer por cancelacion
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `.github/workflows/ci.yml`, `tools/scripts/ci/required-run-freshness.script.ts`, `tools/scripts/ci/required-run-freshness.script.spec.ts`
- **Gate**: lint
- acceptance:
  - "Queda documentado, con datos de la API de GitHub, cuantas de las ultimas 50 ejecuciones de CI sobre develop terminaron canceladas antes de completar el job tests."
  - "El agregado delendai-validate distingue 'no ejecutado todavia' de 'ejecutado y verde', y lo primero nunca cuenta como aprobado, en linea con el criterio de x00534."
  - "Si la solucion elegida es acotar cancel-in-progress a pull_request y dejar los push a develop sin cancelar, se registra el coste estimado en minutos de CI."

## acceptance

- La propuesta registra explicitamente cual de las dos era la verdad: si el rechazo incondicional de 568e5f411 es el comportamiento deseado, los tests y sus snapshots se actualizan explicando por que; si no lo es, se restaura la condicionalidad y se explica que caso legitimo rompia.
- Si se restaura la rama WORKSPACE_HAS_NO_FILES, queda cubierta por un test propio; si se elimina definitivamente, ninguna referencia a ese codigo de rechazo sobrevive en codigo, tipos ni documentacion.
- S1: las suites cross-agent controlada y Git real pasan 8/8 tests, y el typecheck focalizado de commit-policy pasa.
- Gate global de x00538: `bunx vitest run --project commit-policy` debe pasar el conjunto completo antes de cerrar la propuesta; este criterio no bloquea la revisión de S1, pero sí el cierre global.
- Ningun snapshot se actualiza a ciegas con -u sin una frase que justifique el nuevo valor.
- Queda documentado, con datos de la API de GitHub, cuantas de las ultimas 50 ejecuciones de CI sobre develop terminaron canceladas antes de completar el job tests.
- El agregado delendai-validate distingue 'no ejecutado todavia' de 'ejecutado y verde', y lo primero nunca cuenta como aprobado, en linea con el criterio de x00534.
- Si la solucion elegida es acotar cancel-in-progress a pull_request y dejar los push a develop sin cancelar, se registra el coste estimado en minutos de CI.
