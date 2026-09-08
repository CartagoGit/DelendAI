---
id: r00056
title: "SQLite storage modes and canonical proposals DB wiring"
kind: refactor
status: ready
type: proposal
track: architecture
date: 2026-09-08
---

# r00056 — SQLite storage modes and canonical proposals DB wiring

## Goal

Centralizar la ruta de proposals.sqlite y hacer explícita la política de fallback/error durante el cutover.

## why

Hay dos problemas distintos y la proposal cubre los dos porque el segundo es
imposible de razonar sin el primero.

**La ruta.** x00533 introdujo `resolveProposalsDbPaths()` y fijó la ubicación
canónica en `<workspace>/.delendai/state/proposals.sqlite`. El reconciliador ya
la usa. El reader SQL que monta el plugin, no: sigue construyendo
`join(workspaceRoot, 'proposals.sqlite')` a mano. Mientras existan dos rutas, el
sistema puede reconciliar contra una base y leer de otra, y todo el aparato de
paridad mide entonces dos cosas que no tienen por qué coincidir. Una divergencia
así no se manifiesta como error sino como datos viejos, que es la forma más cara
de fallar.

**El modo.** Hoy no existe ningún interruptor. Buscar `sql-primary-compare` en el
código no encuentra nada, y `sql-only` aparece únicamente como una variable de
entorno que el propio gate se fijaba a sí mismo para después comprobarla — una
aserción que no podía fallar (x00537 S2). Sin modos declarados, "activar SQLite"
no es una operación: es un conjunto de ediciones dispersas por los call sites, y
no hay vuelta atrás en una línea.

Los tres modos tienen que significar cosas distintas y verificables:

- `shadow` — el legacy responde; SQL sólo compara. Es el estado actual.
- `sql-primary-compare` — SQL responde; el legacy se conserva para comparar y
  regenerar. **Aquí es donde SQLite pasa a ser la autoridad operacional oficial**,
  y no hace falta esperar al mes de soak para llegar.
- `sql-only` — SQL responde y no hay legacy en el camino de lectura. Una base
  ausente o corrupta es un error explícito, nunca un fallback silencioso.

Esa última cláusula es la que da valor a todo lo demás. Un fallback silencioso
convierte cualquier fallo de la base en "funciona pero con datos legacy", que es
exactamente el estado que impide detectar si el cutover está funcionando. Si el
modo dice `sql-only`, tiene que fallar cerrado.

Nada de lo anterior es reversible con seguridad mientras el doctor no pueda
decir en qué modo está, contra qué ruta, cuántos fallbacks se han producido y si
hay paridad. Por eso el doctor forma parte de esta slice y no de una posterior.

## non-goals

- No implementar aquí el cambio completo de autoridad de r00049.
- No migrar el State Engine general.
- No borrar legacy files.

## Slices

- global_gate: none

### S1 — Resolver única de rutas, storage modes y doctor
- **Status**: pending
- **Files**: `packages/proposals-sqlite/src/lib/paths.ts`, `plugins/proposals/src/lib/storage-mode.ts`, `plugins/proposals/src/lib/services/sql-lifecycle-readers.ts`, `plugins/proposals/src/lib/services/reconciler-service.ts`, `plugins/proposals/src/lib/services/db-doctor/checks/storage-mode.ts`, `packages/proposals-sqlite/tests/src/lib/paths.spec.ts`, `plugins/proposals/tests/src/lib/storage-mode.spec.ts`, `plugins/proposals/tests/src/lib/services/db-doctor.spec.ts`
- **Gate**: type
- acceptance:
  - "Plugin, reconciler, CLI, doctor, exporter y tests usan la misma resolución de DB activa/staging."
  - "No quedan joins ad hoc a proposals.sqlite en los paths operacionales."
  - "shadow permite fallback documentado; sql-primary-compare sirve desde SQLite; sql-only convierte DB missing/corrupt en error explícito y nunca cae silenciosamente a JSON/Markdown."
  - "doctor informa mode, canonical path, fallback count y parity status."

## acceptance

- Plugin, reconciler, CLI, doctor, exporter y tests usan la misma resolución de DB activa/staging.
- No quedan joins ad hoc a proposals.sqlite en los paths operacionales.
- shadow permite fallback documentado; sql-primary-compare sirve desde SQLite; sql-only convierte DB missing/corrupt en error explícito y nunca cae silenciosamente a JSON/Markdown.
- doctor informa mode, canonical path, fallback count y parity status.
