---
id: x00533
title: "proposals_db_status esta construido y testeado pero nunca registrado, y la ruta de proposals.sqlite no es la misma en el lector y en el reconciliador"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-09-08
---

# x00533 — proposals_db_status esta construido y testeado pero nunca registrado, y la ruta de proposals.sqlite no es la misma en el lector y en el reconciliador

## Goal

Que la herramienta de diagnostico de la DB de proposals exista de verdad en el servidor MCP, y que exista UNA sola ruta canonica para proposals.sqlite en todo el sistema.

## why

Auditoria 2026-09-08. (1) buildDbStatusToolRegistration en plugins/proposals/src/lib/tools/db-status.tool.ts:92 tiene exactamente una referencia en src: su propia definicion. Todas las demas estan en tests. La herramienta que x00510 S3 declaro como el primer diagnostico que ejecuta un operador ante una DB sospechosa no esta en la superficie. (2) Hay tres rutas distintas para el mismo fichero: plugins/proposals/src/index.ts:411 usa join(workspaceRoot, proposals.sqlite); reconciler-staging.ts y los repos usan join(statePath, proposals.sqlite); q00022 especifica .delendai/state/proposals.sqlite. Antes de cablear nada (q00022 S4) hay que fijar una sola. (3) No habia entrada *.sqlite en .gitignore: la primera DB creada en la raiz del workspace habria entrado en un commit, siendo un artefacto binario derivado y reconstruible. Esto ya se ha corregido en .gitignore y esta propuesta lo consolida con un test.

## non-goals

- No cablear el camino de escritura (q00022 S4).
- No cambiar el esquema.

## Slices

- global_gate: type

### S1 — ruta canonica unica de proposals.sqlite, resuelta por una sola funcion en el paquete
- **Status**: pending
- **Files**: `packages/proposals-sqlite/src/lib/db-path.ts`, `packages/proposals-sqlite/src/index.ts`, `packages/proposals-sqlite/src/lib/reconciler-staging.ts`, `packages/proposals-sqlite/tests/src/lib/db-path.spec.ts`
- **Gate**: type
- acceptance:
  - "Existe una unica funcion exportada que resuelve la ruta de la DB activa y de la staging a partir del workspace root."
  - "Ni el reconciliador ni los repos ni los tests construyen la ruta con join a mano."
  - "La ruta canonica es la declarada en q00022 y el cambio queda documentado en la propuesta."
  - "Un test verifica que .gitignore cubre *.sqlite, *.sqlite-wal, *.sqlite-shm y la staging."

### S2 — registrar proposals_db_status en el plugin y consumir la ruta canonica
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/index.ts`, `plugins/proposals/src/lib/tools/db-status.tool.ts`, `plugins/proposals/tests/src/lib/tools/db-status.tool.spec.ts`
- **Gate**: type
- acceptance:
  - "proposals_db_status esta registrado y aparece en el catalogo de herramientas del plugin."
  - "Con la DB ausente devuelve exists false y contadores a cero, sin error."
  - "Existe un test que falla si la herramienta deja de estar registrada, no solo si su builder deja de compilar."
  - "buildSqlLifecycleReaders usa la funcion canonica de S1 y deja de construir la ruta a mano."
  - "El campo indexes apunta al indice que el runtime usa de verdad (.cache/delendai/proposals/index.json), ademas del INDEX.json de docs."

### S3 — guardarrail: ninguna herramienta construida queda sin registrar
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `tools/scripts/lint/unregistered-tools.script.ts`, `tools/scripts/lint/unregistered-tools.script.spec.ts`
- **Gate**: type
- acceptance:
  - "Un lint detecta todo builder de IToolRegistration exportado desde plugins/*/src cuya unica referencia fuera de su propio fichero este en tests."
  - "El lint permite una lista de exclusiones explicita y justificada por comentario."
  - "Esta cableado en validate y hoy pasa en verde."

## acceptance

- Existe una unica funcion exportada que resuelve la ruta de la DB activa y de la staging a partir del workspace root.
- Ni el reconciliador ni los repos ni los tests construyen la ruta con join a mano.
- La ruta canonica es la declarada en q00022 y el cambio queda documentado en la propuesta.
- Un test verifica que .gitignore cubre *.sqlite, *.sqlite-wal, *.sqlite-shm y la staging.
- proposals_db_status esta registrado y aparece en el catalogo de herramientas del plugin.
- Con la DB ausente devuelve exists false y contadores a cero, sin error.
- Existe un test que falla si la herramienta deja de estar registrada, no solo si su builder deja de compilar.
- buildSqlLifecycleReaders usa la funcion canonica de S1 y deja de construir la ruta a mano.
- El campo indexes apunta al indice que el runtime usa de verdad (.cache/delendai/proposals/index.json), ademas del INDEX.json de docs.
- Un lint detecta todo builder de IToolRegistration exportado desde plugins/*/src cuya unica referencia fuera de su propio fichero este en tests.
- El lint permite una lista de exclusiones explicita y justificada por comentario.
- Esta cableado en validate y hoy pasa en verde.
