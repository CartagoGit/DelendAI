---
id: f00534
title: "proposals_db_reconcile: la primera escritura de produccion en proposals.sqlite, que hoy no existe porque nada la crea"
kind: feat
status: ready
type: proposal
track: architecture
date: 2026-09-08
---

# f00534 — proposals_db_reconcile: la primera escritura de produccion en proposals.sqlite, que hoy no existe porque nada la crea

## Goal

Dar al pipeline de reconciliacion un punto de entrada de produccion, de modo que .delendai/state/proposals.sqlite exista por primera vez en un workspace real y los lectores SQL dejen de devolver null siempre.

## why

Auditoria 2026-09-08. La capa SQLite de proposals esta construida, testeada y desconectada: un grep de upsertProjection, applyMigrations, reconcileShadowToStaging, applyValidatedCandidate y reconcileProposalMarkdown sobre packages/*/src, plugins/*/src, tools, extensions y apps no devuelve NINGUN llamante de produccion fuera de packages/proposals-sqlite y sus tests. El unico consumidor real es buildSqlLifecycleReaders en plugins/proposals/src/index.ts, que abre el driver con readonly true y devuelve null si el fichero no existe. Consecuencia comprobable en este mismo repositorio dogfood: no hay ningun fichero .sqlite, asi que los lectores devuelven null el 100% de las veces y todo cae al camino JSON. La migracion no esta al 50%: en runtime esta al 0%, con una infraestructura excelente esperando a que alguien la enchufe. q00022 S4 es quien deberia enchufarla, pero esta escrito como un unico salto que reescribe TODOS los caminos de lectura y escritura a la vez, y ademas su lista de ficheros nombra proposal-store.ts, plan-store.ts y slice-store.ts, que no existen en el arbol. Por eso lleva sin empezar desde que se escribio. Esta propuesta extrae el primer escalon ejecutable y de riesgo acotado: hacer que la base de datos exista. No cambia ninguna fuente de verdad, no toca ningun camino de lectura ni de escritura existente, y es reversible borrando un fichero, porque la propia a00094 demuestra que la proyeccion se reconstruye de forma determinista desde el markdown.

## non-goals

- No convertir SQLite en fuente de verdad: el markdown sigue siendo la verdad y la DB es una proyeccion derivada.
- No tocar ningun camino de lectura ni de escritura existente: eso es q00022 S4 y r00049.
- No borrar ni dejar de escribir ningun INDEX.json.

## Slices

- global_gate: type

### S1 — herramienta proposals_db_reconcile: markdown -> staging -> validacion -> apply transaccional
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/db-reconcile.tool.ts`, `plugins/proposals/tests/src/lib/tools/db-reconcile.tool.spec.ts`
- **Gate**: type
- acceptance:
  - "La herramienta lee los .md bajo el directorio de proposals, ejecuta reconcileShadowToStaging y despues applyValidatedCandidate contra la ruta canonica de resolveProposalsDbPaths."
  - "Devuelve contadores de las TRES entidades (proposals, plans, slices), mas quarantined, el digest logico y el sourceCommit."
  - "Es idempotente: ejecutarla dos veces seguidas sobre el mismo arbol produce el mismo digest y no duplica filas."
  - "Si la validacion de staging falla, la base activa queda intacta y la herramienta devuelve el motivo; no lanza."
  - "Ejecutarla sobre un workspace sin base de datos la crea; ejecutarla sobre una existente la actualiza."

### S2 — registro y bootstrap perezoso, sin coste cuando nadie la usa
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/index.ts`, `plugins/proposals/tests/src/lib/tools/db-reconcile-registration.spec.ts`
- **Gate**: type
- acceptance:
  - "La herramienta esta registrada, clasificada en PROPOSALS_TOOL_DISCLOSURE como administrative, y el catalogo managed-lazy regenerado sin drift."
  - "El arranque del plugin NO reconcilia: el coste solo se paga cuando alguien invoca la herramienta. Un test verifica que register() no abre ni crea la base de datos."
  - "Tras invocarla una vez en este repositorio, proposals_db_status deja de devolver exists false y reporta los contadores reales."

### S3 — paridad medida entre la proyeccion SQL y el indice JSON que el runtime usa hoy
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `plugins/proposals/src/lib/services/projection-parity.ts`, `plugins/proposals/tests/src/lib/services/projection-parity.spec.ts`
- **Gate**: type
- acceptance:
  - "Una funcion pura compara el conjunto de ids y estados de la proyeccion SQL contra .cache/delendai/proposals/index.json y devuelve las diferencias clasificadas: solo-en-SQL, solo-en-JSON, estado-divergente."
  - "Sobre el repositorio real la divergencia se MIDE y la cifra queda registrada en la propuesta; no se afirma que sea cero sin haberla medido."
  - "Esta es la evidencia que q00022 S4 necesita antes de invertir la direccion de la verdad: sin paridad demostrada, cambiar el camino de lectura es un salto a ciegas."

## acceptance

- La herramienta lee los .md bajo el directorio de proposals, ejecuta reconcileShadowToStaging y despues applyValidatedCandidate contra la ruta canonica de resolveProposalsDbPaths.
- Devuelve contadores de las TRES entidades (proposals, plans, slices), mas quarantined, el digest logico y el sourceCommit.
- Es idempotente: ejecutarla dos veces seguidas sobre el mismo arbol produce el mismo digest y no duplica filas.
- Si la validacion de staging falla, la base activa queda intacta y la herramienta devuelve el motivo; no lanza.
- Ejecutarla sobre un workspace sin base de datos la crea; ejecutarla sobre una existente la actualiza.
- La herramienta esta registrada, clasificada en PROPOSALS_TOOL_DISCLOSURE como administrative, y el catalogo managed-lazy regenerado sin drift.
- El arranque del plugin NO reconcilia: el coste solo se paga cuando alguien invoca la herramienta. Un test verifica que register() no abre ni crea la base de datos.
- Tras invocarla una vez en este repositorio, proposals_db_status deja de devolver exists false y reporta los contadores reales.
- Una funcion pura compara el conjunto de ids y estados de la proyeccion SQL contra .cache/delendai/proposals/index.json y devuelve las diferencias clasificadas: solo-en-SQL, solo-en-JSON, estado-divergente.
- Sobre el repositorio real la divergencia se MIDE y la cifra queda registrada en la propuesta; no se afirma que sea cero sin haberla medido.
- Esta es la evidencia que q00022 S4 necesita antes de invertir la direccion de la verdad: sin paridad demostrada, cambiar el camino de lectura es un salto a ciegas.
