---
id: x00539
title: "Tres defectos hacian imposible proyectar este repositorio a SQLite: vocabulario sin normalizar, promocion que exige ok, y PlanRepo.create no idempotente"
kind: fix
status: ready
type: proposal
track: architecture
date: 2026-09-08
---

# x00539 — Tres defectos hacian imposible proyectar este repositorio a SQLite: vocabulario sin normalizar, promocion que exige ok, y PlanRepo.create no idempotente

## Goal

Que el pipeline de reconciliacion pueda proyectar un repositorio real completo sin que la herramienta de entrada tenga que rodear los defectos con un pre-flight.

## why

Descubierto al implementar f00534, ejecutando el pipeline por primera vez contra datos reales en vez de contra fixtures. Los tres se encontraron corriendolo, no leyendolo, y ninguno estaba cubierto por los 80 tests del paquete porque los fixtures son sinteticos y limpios. (1) ProposalRepo.upsertProjection escribe el kind y el status crudos del frontmatter en columnas con restriccion CHECK, sin normalizar. Tres ficheros del repositorio llevan 'kind: infra', que no esta en el enum de proposals.kind. Resultado: CHECK constraint failed, la ejecucion entera queda en failed y con cero filas, tras haber procesado 547 de 895 propuestas. (2) applyValidatedCandidate solo promociona una ejecucion de staging cuyo status sea 'ok', pero basta un unico fichero en cuarentena para que el status sea 'degraded', y los seis README.md que viven bajo el arbol de proposals ya son suficientes. Consecuencia: desde este repositorio NUNCA se habria podido promocionar nada, ni siquiera con un escritor cableado. Es el defecto mas grave de los tres porque convierte la cuarentena, que existe justamente para no perder entradas corruptas (f00515), en un bloqueo total. (3) PlanRepo.create es un INSERT plano, no un upsert, asi que el f00418 duplicado aborto el staging con UNIQUE constraint failed en plans.uid tras 437 de 790 planes. Hoy f00534 los rodea los tres en un pre-flight que REPORTA cada exclusion, de modo que nada se pierde en silencio, pero eso es un parche en la herramienta de entrada y el sitio correcto es el paquete. Mientras siga asi, la proyeccion excluye 10 de 901 ficheros y la paridad medida no puede llegar a 100%.

## non-goals

- No eliminar el pre-flight de f00534: seguira siendo util como diagnostico aunque el paquete deje de necesitarlo.
- No ampliar el vocabulario de kind a base de anadir valores sin criterio: primero hay que decidir cual es la ontologia canonica.

## Slices

- global_gate: type

### S1 — normalizar kind y status en la frontera de escritura, con una ontologia unica
- **Status**: done
- **Files**: `packages/proposals-sqlite/src/lib/repository/proposals-repo.ts`, `packages/proposals-sqlite/src/lib/vocabulary.ts`, `packages/proposals-sqlite/tests/src/lib/vocabulary.spec.ts`
- **Gate**: type
- acceptance:
  - "Existe un unico modulo que define el vocabulario aceptado de kind y status y la funcion que normaliza un valor de frontmatter a el."
  - "El enum de la columna y el vocabulario del modulo se derivan de la misma fuente: no pueden divergir sin fallar un test."
  - "'infra' queda resuelto de forma explicita: o entra en el vocabulario canonico, o se mapea a un valor existente, y la propuesta registra cual de las dos y por que."
  - "Un kind desconocido NO revienta la ejecucion entera: la entidad va a cuarentena con el motivo, que es el contrato que f00515 ya define."
  - "Los tres ficheros i00002, i00003 e i00004 se proyectan correctamente."
- review-state: done
- review-implementer: delendai-impl-20260908
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revisión independiente completada. La implementación ya estaba presente en el commit declarado y la validación compatible con bun:sqlite pasó; el typecheck focalizado también pasó.
### S2 — una ejecucion degraded es promocionable; solo failed bloquea
- **Status**: done
- **Files**: `packages/proposals-sqlite/src/lib/reconciler-apply-candidate.ts`, `packages/proposals-sqlite/tests/src/lib/reconciler-apply-candidate.spec.ts`
- **Gate**: type
- acceptance:
  - "applyValidatedCandidate promociona una staging con status 'degraded' siempre que integrity_check y foreign_key_check esten en ok y el digest coincida; solo 'failed' bloquea."
  - "El resultado del apply reporta cuantas entradas quedaron en cuarentena, para que degraded nunca sea silencioso."
  - "Un test cubre exactamente el caso de este repositorio: un README.md sin frontmatter entre ficheros validos no impide la promocion del resto."
  - "Un test cubre que una staging con integridad rota sigue sin promocionarse."
- review-state: done
- review-implementer: delendai-impl-20260908
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revisión independiente completada. applyValidatedCandidate acepta staging degraded cuando integrity/FK/digest son válidos, rechaza failed y expone quarantinedEntries. La validación Bun pasó 6/6 y el typecheck focalizado pasó.
### S3 — PlanRepo.create y SliceRepo.create son idempotentes por uid
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `packages/proposals-sqlite/src/lib/repository/plans-repo.ts`, `packages/proposals-sqlite/src/lib/repository/slices-repo.ts`, `packages/proposals-sqlite/tests/src/lib/repository/plans-repo.spec.ts`
- **Gate**: type
- acceptance:
  - "Crear dos veces el mismo uid actualiza la proyeccion en vez de lanzar UNIQUE constraint failed, igual que ya hace ProposalRepo.upsertProjection."
  - "El comportamiento queda alineado entre las tres entidades: o las tres hacen upsert de proyeccion, o las tres fallan igual y el reconciliador deduplica antes."
  - "Un test reproduce el caso real: dos ficheros markdown declarando el mismo id de plan."
- review-state: done
- review-implementer: delendai-impl-20260908
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revisión independiente completada. PlanRepo.create y SliceRepo.create son idempotentes por uid y actualizan la proyección sin duplicar filas; el caso real f00418 está cubierto. La suite Bun pasó 5/5 y el typecheck focalizado pasó.
### S4 — medir de nuevo la paridad y registrar la cifra
- **Status**: pending
- **DependsOn**: [S1, S2, S3]
- **Files**: `docs/delendai/proposals/ready/feats/f00534-proposals-db-reconcile-la-primera-escritura-de-produccion-en-proposals-sqlite-que-hoy-no-existe-porque-nada-la-crea.md`
- **Gate**: none
- acceptance:
  - "Se vuelve a ejecutar la medicion de paridad de f00534 S3 sobre el repositorio real y se registra la cifra nueva junto a la anterior (3 de 894, 0.34%)."
  - "Si la paridad no llega a total, las diferencias restantes quedan enumeradas una por una con su causa; no se declara exito por aproximacion."

## decisions

Registro explicito de las dos decisiones que las acceptances de S1 y S3
piden dejar por escrito.

### D1 — `infra` ENTRA en el vocabulario canonico; no se mapea

Se anade `infra` al enum de `proposals.kind` (migracion forward 0011),
no se traduce a `chore`. Razon: el plugin de proposals ya lo trata como
familia de primer nivel, no como sinonimo. En
`PROPOSAL_KINDS` tiene prefijo propio (`i`, de ahi `i00002`, `i00003`,
`i00004` en disco), glifo propio, carpeta propia en `done/infras/` y
posicion propia en el orden de cascada. Mapearlo a `chore` — su
`conventionalCommitType` es `chore(infra)` — haria que
`SELECT ... WHERE kind = 'infra'` no devolviera nunca nada y dejaria
una divergencia permanente entre la ontologia de autoria y la
proyeccion, que es justo la deriva que este fix existe para impedir.

En la misma migracion se anade `repair` (prefijo `e`), tambien de
primer nivel en la ontologia del plugin y todavia sin ningun fichero en
disco: con esos dos, el enum de la columna y el `IProposalKind` del
plugin son los mismos 15 valores. El vocabulario vive en
`packages/proposals-sqlite/src/lib/vocabulary.ts` y
`vocabulary.spec.ts` compara ese modulo con el enum leido del propio
SQL en los dos sentidos, de modo que ninguno de los dos puede cambiar
solo.

### D2 — las tres entidades hacen upsert de proyeccion

Alineadas hacia el comportamiento que `ProposalRepo.upsertProjection`
ya tenia: `PlanRepo.create` y `SliceRepo.create` son ahora idempotentes
por `uid` (insert si no existe, update con `revision + 1` si cambio
algo, no-op si es identico). La alternativa — que las tres fallasen
igual y el reconciliador deduplicase antes — se descarto porque
obligaria a elegir un ganador fuera del punto de escritura y a duplicar
esa regla en cada llamador; con el upsert el ganador es el ultimo
candidato en orden canonico (uid, path), que es determinista.

## acceptance

- Existe un unico modulo que define el vocabulario aceptado de kind y status y la funcion que normaliza un valor de frontmatter a el.
- El enum de la columna y el vocabulario del modulo se derivan de la misma fuente: no pueden divergir sin fallar un test.
- 'infra' queda resuelto de forma explicita: o entra en el vocabulario canonico, o se mapea a un valor existente, y la propuesta registra cual de las dos y por que.
- Un kind desconocido NO revienta la ejecucion entera: la entidad va a cuarentena con el motivo, que es el contrato que f00515 ya define.
- Los tres ficheros i00002, i00003 e i00004 se proyectan correctamente.
- applyValidatedCandidate promociona una staging con status 'degraded' siempre que integrity_check y foreign_key_check esten en ok y el digest coincida; solo 'failed' bloquea.
- El resultado del apply reporta cuantas entradas quedaron en cuarentena, para que degraded nunca sea silencioso.
- Un test cubre exactamente el caso de este repositorio: un README.md sin frontmatter entre ficheros validos no impide la promocion del resto.
- Un test cubre que una staging con integridad rota sigue sin promocionarse.
- Crear dos veces el mismo uid actualiza la proyeccion en vez de lanzar UNIQUE constraint failed, igual que ya hace ProposalRepo.upsertProjection.
- El comportamiento queda alineado entre las tres entidades: o las tres hacen upsert de proyeccion, o las tres fallan igual y el reconciliador deduplica antes.
- Un test reproduce el caso real: dos ficheros markdown declarando el mismo id de plan.
- Se vuelve a ejecutar la medicion de paridad de f00534 S3 sobre el repositorio real y se registra la cifra nueva junto a la anterior (3 de 894, 0.34%).
- Si la paridad no llega a total, las diferencias restantes quedan enumeradas una por una con su causa; no se declara exito por aproximacion.
