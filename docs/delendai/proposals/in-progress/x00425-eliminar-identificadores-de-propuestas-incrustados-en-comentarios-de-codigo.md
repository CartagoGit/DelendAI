---
id: x00425
title: "Eliminar identificadores de propuestas incrustados en comentarios de código"
kind: fix
status: in-progress
type: proposal
track: quality
date: 2026-09-03
---

# x00425 — Eliminar identificadores de propuestas incrustados en comentarios de código

## Goal

Restaurar el gate no-proposal-id-comments eliminando referencias de trazabilidad desde comentarios de producción; la trazabilidad queda en git y el grafo de propuestas.

## why

El gate detecta 19 referencias nuevas; son metadatos históricos que no deben vivir en código fuente.

## non-goals

- No se tocan los comentarios que explican **por qué** el código es como
  es. Lo que sale es el identificador de trazabilidad, no el razonamiento:
  un comentario que dice "esto existe porque dos agentes escribían el
  mismo fichero" sigue siendo el comentario correcto sin el `x00187`
  delante.
- No se tocan los ficheros de propuestas ni la documentación, donde los
  identificadores son el vocabulario propio del documento.
- No se retira el identificador de los mensajes de commit: ahí la
  trazabilidad es exactamente lo que se quiere conservar, y es el sitio
  que git indexa.
- No se convierte el gate en trinquete: la deuda son 19 referencias
  concretas y acotadas, así que se salda en vez de registrarse.

## Slices

- global_gate: lint

### S1 — Limpiar comentarios de producción
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/fs-tools.ts`, `plugins/quality-policy/src/index.ts`, `plugins/commit-policy/src/index.ts`, `plugins/commit-policy/src/lib/engine.ts`, `plugins/commit-policy/src/lib/processed-events.ts`, `plugins/commit-policy/src/lib/triggers/slice-listener.ts`, `plugins/commit-policy/src/lib/services/resolve-scope.ts`, `plugins/commit-policy/src/lib/services/commit-driver.ts`, `plugins/proposals/src/lib/contracts/constants/proposal-glossary.constant.ts`
- **Gate**: lint
- acceptance:
  - "bun run lint:no-proposal-id-comments-in-source sale con código 0"
  - "No cambia el comportamiento de runtime"

## acceptance

- bun run lint:no-proposal-id-comments-in-source sale con código 0
- No cambia el comportamiento de runtime
