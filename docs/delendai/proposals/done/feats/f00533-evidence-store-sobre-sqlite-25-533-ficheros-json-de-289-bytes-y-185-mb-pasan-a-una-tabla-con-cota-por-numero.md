---
id: f00533
title: "Evidence store sobre SQLite: 25.533 ficheros JSON de 289 bytes y 185 MB pasan a una tabla con cota por numero"
kind: feat
status: done
type: proposal
track: perf
date: 2026-09-08
shipped-in: ["e4cb4148badb4560806bf75c509033892addfe18"]
last-transition-id: c20d3b30-5299-47f3-9d33-8e5b76c19d24
last-correlation-id: c20d3b30-5299-47f3-9d33-8e5b76c19d24
last-transition-from: review
---

# f00533 — Evidence store sobre SQLite: 25.533 ficheros JSON de 289 bytes y 185 MB pasan a una tabla con cota por numero

## Goal

Sustituir el almacenamiento un-fichero-por-evento del evidence store por una tabla SQLite con retencion por antiguedad Y por numero de filas, manteniendo la API del IEvidenceStore intacta.

## why

Auditoria 2026-09-08, medido sobre el propio repositorio dogfood. .cache/delendai pesa 206 MB, de los cuales .cache/delendai/evidence son 185 MB repartidos en 25.533 ficheros JSON: 12.656 en evidence/surface, 12.653 en evidence/skills y 190 en evidence/startup-report. El tamano tipico de cada fichero es 289 bytes. La politica de retencion en packages/core/src/lib/evidence/evidence-store.ts:57 es unicamente olderThanMtimeDays con default 30 dias: no hay cota por numero ni por tamano, asi que nada se evicta hasta cumplir 30 dias. Con la cadencia observada (~2.800 ficheros por tipo y dia) el estado estacionario ronda las 80.000 entradas y ~600 MB antes de que se borre la primera. Un fichero por evento de 289 bytes es el caso canonico de una tabla. Ademas evidence es el mejor primer candidato a SQLite de todo el repositorio: no tiene consumidores externos, no tiene formato publico, la migracion es un INSERT por fichero, y valida el patron facade (primario SQLite, fallback fichero) que packages/state-telemetry ya demostro que funciona, sin arriesgar el camino critico de proposals.

## non-goals

- No cambiar la interfaz IEvidenceStore que consumen los plugins.
- No tocar proposals.sqlite ni el State Engine: evidence tiene su propia DB.
- No borrar evidence historico sin migrarlo primero.

## Slices

- global_gate: type

### S1 — esquema y repositorio de evidence en SQLite
- **Status**: done
- **Files**: `packages/core/src/lib/evidence/evidence-sqlite-schema.ts`, `packages/core/src/lib/evidence/evidence-repo.ts`, `packages/core/tests/src/lib/evidence/evidence-repo.spec.ts`
- **Gate**: type
- acceptance:
  - "Tabla evidence con columnas id, type, recorded_at, payload y indices por type y recorded_at, en modo STRICT."
  - "El repositorio expone append, listByType y prune, y prune acepta tanto olderThanDays como keepLastN."
  - "Escribir 10.000 entradas y podar a keepLastN 1.000 deja exactamente 1.000 filas, las mas recientes."
  - "integrity_check en ok tras las operaciones."
- review-state: done
- review-implementer: Armenia
- review-reviewer: delendai-orchestrator
- review-log: approved by delendai-orchestrator
### S2 — facade: SQLite primario, ficheros como fallback, misma API publica
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/evidence/evidence-store.ts`, `packages/core/src/lib/evidence/evidence-store.facade.ts`, `packages/core/tests/src/lib/evidence/evidence-store.spec.ts`
- **Gate**: type
- acceptance:
  - "La interfaz IEvidenceStore no cambia: ningun plugin consumidor se modifica."
  - "Si la DB no puede abrirse, el store degrada al backend de ficheros y lo registra una sola vez, sin lanzar."
  - "La politica de eviccion registrada incluye keepLastN ademas de olderThanMtimeDays, con default explicito y documentado."
  - "Los tests existentes de evidence siguen verdes sin cambios de expectativas de API."
- review-state: done
- review-implementer: Parthia
- review-reviewer: delendai-orchestrator
- review-log: approved by delendai-orchestrator
### S3 — migrador one-shot de los ficheros existentes y medida del antes y el despues
- **Status**: done
- **DependsOn**: [S2]
- **Files**: `packages/core/src/lib/evidence/evidence-migrate.ts`, `packages/core/tests/src/lib/evidence/evidence-migrate.spec.ts`, `docs/delendai/PROJECT-OBSERVABILITY.md`
- **Gate**: e2e
- acceptance:
  - "El migrador recorre evidence/<type>/*.json una vez, inserta cada entrada y borra el fichero solo tras un commit correcto; es idempotente y reanudable tras un crash."
  - "Sobre un fixture de 20.000 ficheros, la migracion no carga todo en memoria y opera por lotes."
  - "La documentacion registra la cifra medida antes (25.533 ficheros / 185 MB) y despues, para que la mejora sea verificable y no una afirmacion."
- review-state: done
- review-implementer: Media
- review-reviewer: delendai-orchestrator
- review-log: approved by delendai-orchestrator
## acceptance

- Tabla evidence con columnas id, type, recorded_at, payload y indices por type y recorded_at, en modo STRICT.
- El repositorio expone append, listByType y prune, y prune acepta tanto olderThanDays como keepLastN.
- Escribir 10.000 entradas y podar a keepLastN 1.000 deja exactamente 1.000 filas, las mas recientes.
- integrity_check en ok tras las operaciones.
- La interfaz IEvidenceStore no cambia: ningun plugin consumidor se modifica.
- Si la DB no puede abrirse, el store degrada al backend de ficheros y lo registra una sola vez, sin lanzar.
- La politica de eviccion registrada incluye keepLastN ademas de olderThanMtimeDays, con default explicito y documentado.
- Los tests existentes de evidence siguen verdes sin cambios de expectativas de API.
- El migrador recorre evidence/<type>/*.json una vez, inserta cada entrada y borra el fichero solo tras un commit correcto; es idempotente y reanudable tras un crash.
- Sobre un fixture de 20.000 ficheros, la migracion no carga todo en memoria y opera por lotes.
- La documentacion registra la cifra medida antes (25.533 ficheros / 185 MB) y despues, para que la mejora sea verificable y no una afirmacion.
