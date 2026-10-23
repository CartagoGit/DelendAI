---
id: x00219
title: "mutex: reclaim seguro de stale lock (CAS/lease) y métricas de contención"
kind: fix
status: done
type: proposal
track: concurrency
date: 2026-08-24
---

# x00219 — mutex: reclaim seguro de stale lock (CAS/lease) y métricas de contención

## Goal

Proteger el reclaim de locks stale contra la carrera `waiter stat → holder heartbeat → waiter rm`, de modo que un waiter no borre un lock cuya identidad/lease cambió desde su observación.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §5 MX-001 — reclaim seguro de stale lock
- §5 MX-002 — métricas de contention
- §28 CHECK-003 — validar determinismo de la carrera antes de fijar

Opciones: token + mtime + revalidación, rename del sidecar a reclaim path, lease generation, PID liveness. El reclaim debe validar identidad/generación antes de adquirir. Test de carrera controlada con barreras: el waiter observa stale, el holder hace heartbeat, el waiter intenta reclaim → el waiter no debe entrar.

Métricas de contención (solo agregados/IDs internos, sin paths): `waitMs`, `contentionCount`, `staleReclaims`, `failedAcquisitions`.

## why

El token evita que el antiguo propietario borre el lock del nuevo, pero no evita que durante un intervalo dos procesos ejecuten la sección crítica a la vez. Es una carrera real en un primitivo usado por todo el ecosistema.

## non-goals

- No cambiar el modelo O_EXCL/token/heartbeat existente (se refuerza, no se sustituye).
- No exponer paths en las métricas.
- No introducir un lock backend dependiente de plataforma si el rename+CAS cubre la carrera.

## Slices

- global_gate: type

### S1 — Reclaim con validación de identidad/lease
- **Status**: done
- **Files**: `packages/core/src/lib/shared/with-file-mutex.ts`
- **Gate**: type
- acceptance:
  - "El reclaim lee token+mtime, valida lease, renombra a reclaim path y revalida token antes de adquirir."
  - "Un lock renovado (heartbeat) durante la observación NO es reclamado."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: spec dedicado confirmado (sync-proposal-registry-mutex.spec.ts); validate verde.
### S2 — Métricas de contención
- **Status**: done
- **Files**: `packages/core/src/lib/shared/mutex-metrics.helper.ts`
- **Gate**: type
- acceptance:
  - "Registra waitMs, contentionCount, staleReclaims, failedAcquisitions sin paths privados."

### S3 — Test de carrera controlada
- **Status**: done
- **Files**: `packages/core/tests/src/lib/shared/with-file-mutex-reclaim.spec.ts`
- **Gate**: type
- acceptance:
  - "Carrera con barreras: waiter observa stale, holder heartbeat, waiter intenta reclaim -> waiter no entra."

## acceptance

- El reclaim lee token+mtime, valida lease, renombra a reclaim path y revalida token antes de adquirir.
- Un lock renovado (heartbeat) durante la observación NO es reclamado.
- Registra waitMs, contentionCount, staleReclaims, failedAcquisitions sin paths privados.
- Carrera con barreras: waiter observa stale, holder heartbeat, waiter intenta reclaim -> waiter no entra.
