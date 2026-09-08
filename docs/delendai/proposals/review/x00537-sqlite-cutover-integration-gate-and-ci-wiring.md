---
id: x00537
title: "SQLite cutover integration gate and CI wiring"
kind: fix
status: review
type: proposal
track: architecture
date: 2026-09-08
last-transition-id: 2ca682c1-3bf1-41cc-976f-f9428e740da5
last-correlation-id: 2ca682c1-3bf1-41cc-976f-f9428e740da5
last-transition-from: in-progress
---

# x00537 — SQLite cutover integration gate and CI wiring

## Goal

Crear un gate de integración ejecutable desde checkout limpio que impida declarar SQLite cutover listo sin evidencia completa.

## why

TODO: why this work matters now.

## non-goals

- No activar aún sql-primary automáticamente.
- No configurar branch protection si no hay permisos GitHub.
- No mezclar la migración del swarm State Engine.

## Slices

- global_gate: none

### S1 — Workflows, lockfile y gate sqlite-cutover-ready
- **Status**: done
- **Files**: `.github/workflows/ci.yml`, `.github/workflows/quality-gate.yml`, `bun.lock`, `tools/tests/ci/sqlite-cutover-ready.spec.ts`, `tools/scripts/ci/sqlite-cutover-ready.script.ts`, `package.json`
- **Gate**: e2e
- acceptance:
  - "delendai-rebuild-digest es job top-level y delendai-validate depende de él."
  - "quality-gate.yml parsea y ejecuta el comando integrado."
  - "bun install --frozen-lockfile funciona desde checkout limpio."
  - "El gate verifica build, pack smoke, migrations, full reconcile y rebuild digest."
  - "El gate registra commit fuente, DB path e integrity checks sobre una base recién migrada."
- review-state: done
- review-implementer: delendai-impl-20260908
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificación independiente: el wiring de CI declara sqlite-cutover-ready como job top-level y lo incluye en delendai-validate; quality-gate.yml ejecuta el comando integrado. El runner usa comandos reales y rutas explícitas, valida empaquetado reproducible, suites SQLite y una sonda sql-only con checks de integridad. El gate completo terminó correctamente.
## acceptance

- delendai-rebuild-digest es job top-level y delendai-validate depende de él.
- quality-gate.yml parsea y ejecuta el comando integrado.
- bun install --frozen-lockfile funciona desde checkout limpio.
- El gate verifica build, pack smoke, migrations, full reconcile y rebuild digest. **(corregido — ver S2)**
- El gate no certifica readiness: nombra explícitamente las propiedades que NO verifica y rechaza `--assert-ready` mientras quede alguna. **(corregido — ver S2)**


### S2 — El gate decía verificar propiedades que no verificaba
- **Status**: done
- **Files**: `tools/scripts/ci/sqlite-cutover-ready.script.ts`, `tools/tests/ci/sqlite-cutover-ready.spec.ts`
- **Gate**: unit
- acceptance:
  - "El script enumera las propiedades pendientes con su proposal y las imprime en cada ejecución."
  - "`--assert-ready` sale distinto de cero mientras quede una propiedad pendiente, aunque todos los checks pasen."
  - "El mensaje final ya no afirma readiness."

Una auditoría externa señaló que S1 se aprobó con una acceptance que el
código no cumplía. El gate se llamaba `sqlite-cutover-ready`, salía verde,
y su acceptance afirmaba verificar CAS race, idempotency replay/conflict,
outbox recovery, stale staging rejection, tombstones y legacy export.
No verificaba ninguna de las seis.

Dos ejemplos concretos de por qué el verde no significaba nada:

- La sonda `sql-only` leía `DELENDAI_STORAGE_MODE` y comprobaba que fuera
  `sql-only`. Esa variable la fija `runCommand`, dos funciones más arriba,
  en la misma ejecución. La aserción no podía fallar. Y `sql-only` no
  está implementado en ninguna parte (r00056).
- El `integrity_check` se ejecutaba sobre una base temporal **vacía**
  recién creada, no sobre una proyección real.

Lo que NO se ha hecho: poner el job en rojo. Los checks que ejecuta
(build, pack, migraciones, reconcile, digest rebuild) son cobertura de
regresión legítima y valiosa, y vale la pena mantenerlos verdes. Lo que
se ha eliminado es la promesa falsa: el job reporta lo que realmente
probó, y después nombra las seis propiedades que no probó, cada una con
la proposal que la cierra (r00048, r00049, r00050, r00055, r00056,
f00514). Cualquier consumidor que quiera preguntar "¿podemos hacer el
cutover?" usa `--assert-ready`, que responde que no.

Borrar una entrada de `OUTSTANDING_CUTOVER_PROPERTIES` para obtener un
informe más verde reconstruye exactamente el problema que esta slice
cierra. Se borra cuando el gate demuestre la propiedad.
