---
id: x00537
title: "SQLite cutover integration gate and CI wiring"
kind: fix
status: ready
type: proposal
track: architecture
date: 2026-09-08
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
- **Status**: pending
- **Files**: `.github/workflows/ci.yml`, `.github/workflows/quality-gate.yml`, `bun.lock`, `tools/tests/ci/sqlite-cutover-ready.spec.ts`, `tools/scripts/ci/sqlite-cutover-ready.script.ts`, `package.json`
- **Gate**: e2e
- acceptance:
  - "delendai-rebuild-digest es job top-level y delendai-validate depende de él."
  - "quality-gate.yml parsea y ejecuta el comando integrado."
  - "bun install --frozen-lockfile funciona desde checkout limpio."
  - "El gate verifica build, pack smoke, migrations, CAS race, idempotency replay/conflict, outbox recovery, full reconcile, stale staging rejection, tombstones, rebuild digest y legacy export."
  - "El gate falla ante cualquier fallback legacy operacional o DB corrupta en sql-only y registra commit fuente, DB path, storage mode e integrity checks."

## acceptance

- delendai-rebuild-digest es job top-level y delendai-validate depende de él.
- quality-gate.yml parsea y ejecuta el comando integrado.
- bun install --frozen-lockfile funciona desde checkout limpio.
- El gate verifica build, pack smoke, migrations, CAS race, idempotency replay/conflict, outbox recovery, full reconcile, stale staging rejection, tombstones, rebuild digest y legacy export.
- El gate falla ante cualquier fallback legacy operacional o DB corrupta en sql-only y registra commit fuente, DB path, storage mode e integrity checks.
