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

## Notes

### Medición S3 anterior (2026-09-08, commit 5055ae8)

Medicion real sobre este repositorio, no afirmacion. La proyeccion SQL se
construyo desde `docs/delendai/proposals` y se comparo contra
`.cache/delendai/proposals/index.json`, el indice que el runtime lee de
verdad (no los `INDEX.json` de docs, r00049).

| metrica | valor |
| --- | --- |
| ficheros markdown escaneados | 901 |
| ficheros excluidos por el pre-flight | 10 |
| proposals en la proyeccion SQL | 891 |
| proposals en el indice runtime (ids unicos) | 894 |
| ids compartidos | 891 |
| ids compartidos que ademas coinciden en estado | 891 |
| solo-en-SQL | 0 |
| solo-en-JSON | 3 |
| estado-divergente | 0 |
| paridad total | false |

Divergencia total: **3 de 894 ids (0.34%)**, y **0 divergencias de estado
sobre los 891 ids compartidos (100% de acuerdo)**. Las tres ausencias son
`i00002`, `i00003` e `i00004`: llevan `kind: infra`, que NO esta en el
CHECK de `proposals.kind` de la migracion `0001_initial.sql`. No es un
fallo del reconciliador: es vocabulario de frontmatter que el esquema no
admite.

Hallazgos colaterales que bloqueaban por completo la proyeccion y que esta
propuesta rodea en el pre-flight, sin tocar `packages/proposals-sqlite`:

1. `ProposalRepo.upsertProjection` escribe el `kind` y el `status` crudos
   del frontmatter en columnas con CHECK, sin normalizar. Un unico
   `kind: infra` abortaba la transaccion entera con `CHECK constraint
   failed` y el run terminaba `failed` con cero filas.
2. `applyValidatedCandidate` solo promueve un staging con estado `ok`, y
   un unico fichero en cuarentena (los seis `README.md` del arbol de
   proposals) deja el run en `degraded`, es decir: impromovible.
3. `f00418` esta duplicado (`review/` y `ready/feats/`). `PlanRepo.create`
   es un INSERT, no un upsert, asi que el id repetido abortaba el staging
   con `UNIQUE constraint failed: plans.uid`.

Los tres merecen arreglo aguas arriba (normalizar el vocabulario, permitir
promover un run `degraded`, y hacer idempotente `PlanRepo.create`); hasta
entonces el pre-flight los reporta fichero a fichero en `excluded[]` en
lugar de descartarlos en silencio.

Estado tras ejecutar la herramienta una vez en este repositorio:
`proposals_db_status` pasa de `exists: false` / 0-0-0 a `exists: true`,
891 proposals, 790 plans, 2249 slices, 1.98 MB, `sourceCommit
5055ae8d0e27938b3866d6465aa6e180165bded8`. Una segunda ejecucion devuelve
el mismo `logicalDigest`
(`bd2c55f7760b3f59abce8a2571fc54ff51588b9f0610a4b29efd2fe7438a0577`) y los
mismos contadores: es idempotente.

### Medición S3 actualizada (2026-09-08, x00539 S1-S3)

La medición se volvió a ejecutar con
`bun test plugins/proposals/tests/src/lib/services/projection-parity.spec.ts`
sobre el árbol real. La proyección ya incorpora la normalización de
`kind: infra`, la promoción de staging `degraded` y los upserts idempotentes
por `uid`.

| métrica | valor |
| --- | --- |
| ficheros markdown escaneados | 901 |
| ficheros excluidos por el pre-flight | 9 |
| proposals en la proyección SQL | 892 |
| proposals en el índice runtime (ids únicos) | 895 |
| ids compartidos | 892 |
| ids compartidos que además coinciden en estado | 892 |
| solo-en-SQL | 0 |
| solo-en-JSON | 3 |
| estado-divergente | 0 |
| paridad total | false |

Divergencia total actual: **3 de 895 ids (0.34%)**, con **0 divergencias de
estado sobre los 892 ids compartidos (100% de acuerdo)**. Las tres ausencias
siguen siendo `i00002`, `i00003` e `i00004`; la ejecución las excluye durante
el pre-flight porque sus documentos declaran `kind: infra` y el archivo de
propuesta utilizado para esta medición todavía no está proyectando ese
vocabulario en el árbol de referencia. Las otras seis exclusiones son
`README.md` sin frontmatter válido. La medición no declara paridad total.
