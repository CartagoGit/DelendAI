---
id: x00322
title: "Cerrar de forma atómica locks, asignaciones y suscripciones de agentes"
kind: fix
status: done
shipped-in: [working-tree-2026-08-30-lifecycle-validation]
type: proposal
track: proposals-coordination
date: 2026-08-30
---

# x00322 — Cerrar de forma atómica locks, asignaciones y suscripciones de agentes

## Goal

Corregir la divergencia entre agentes realmente terminados y registros persistentes activos: toda finalización normal o cancelación debe liberar lock, asignación y suscripción; los crashes deben recuperarse por lease/GC sin falsos agentes vivos.

## why

El estado real mostró workers inexistentes que permanecían activos porque el flujo de delegación crea assignment y lock por separado, mientras close_slice solo libera el lock y no finaliza el lease/subscription. El notifier observa lock releases, pero no el ciclo de vida de las asignaciones.

## non-goals

- No eliminar la recuperación de crashes basada en heartbeat/lease.
- No borrar registros históricos de agentes adoptados.
- No cambiar la semántica de cooldown ni los nombres canónicos salvo que sea necesario para cerrar el ciclo de vida.

## Slices

- global_gate: type

### S1 — Auditar y definir contrato de finalización
- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/agent-names.tool.ts`, `plugins/proposals/src/lib/tools/orchestration.tool.ts`, `plugins/proposals/src/lib/shared/agent-registry-store.ts`, `plugins/proposals/tests/src/lib/agent-names.spec.ts`, `plugins/proposals/tests/src/lib/orchestration.spec.ts`
- **Gate**: type
- acceptance:
  - "La ruta normal de finalización libera o marca correctamente la asignación y cancela su lease/subscription."
  - "La operación es idempotente y rechaza tokens de suscripción incorrectos."
  - "La delegación no deja asignaciones activas si falla la creación del worktree o del lock."
- review-state: done
- review-implementer: mcp-vertex-orchestrator
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revisión independiente completada: release invalida token/lease, heartbeat posterior rechazado, compensación de delegate verificada y suites focalizadas verdes.
### S2 — Integrar cierre de slice con lifecycle cleanup
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/lib/tools/recovery-tools.ts`, `plugins/proposals/tests/src/lib/close-slice-validation.spec.ts`, `plugins/proposals/tests/src/lib/tools/recovery-tools.spec.ts`
- **Gate**: type
- acceptance:
  - "close_slice libera lock y assignment/subscription en una ruta coordinada."
  - "request_changes, approve, cancelación y errores no dejan leases activos huérfanos."
  - "La respuesta indica de forma verificable lockReleased y assignmentReleased."
- review-state: done
- review-implementer: mcp-vertex-orchestrator
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revisión independiente completada: close_slice y proposal_review liberan lock y assignment/subscription, assignmentReleased está en outputSchema y tipos generados sincronizados.
### S3 — Regresiones de watcher, lease y recuperación
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `plugins/notification/src/lib/services/watcher.ts`, `plugins/notification/src/lib/tools/tools.ts`, `plugins/proposals/src/lib/agents/zombie-reconcile.ts`, `plugins/proposals/src/lib/tools/state-tools.tool.ts`, `plugins/notification/tests/src/lib/notification.spec.ts`, `plugins/proposals/tests/src/lib/agents/zombie-reconcile.spec.ts`, `plugins/proposals/tests/src/lib/state-tools.spec.ts`
- **Gate**: type
- acceptance:
  - "Una liberación normal produce una señal única y no genera falso lock-released tras restart del watcher."
  - "Un lease expirado recupera lock, assignment y suscripción de forma consistente."
  - "El estado reporta active=0 después del cierre normal sin esperar al GC."
- review-state: done
- review-implementer: mcp-vertex-orchestrator
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revisión independiente completada: watcher/recovery/lease regresiones verificadas y el estado queda sin locks ni zombies tras cleanup.
## acceptance

- La ruta normal de finalización libera o marca correctamente la asignación y cancela su lease/subscription.
- La operación es idempotente y rechaza tokens de suscripción incorrectos.
- La delegación no deja asignaciones activas si falla la creación del worktree o del lock.
- close_slice libera lock y assignment/subscription en una ruta coordinada.
- request_changes, approve, cancelación y errores no dejan leases activos huérfanos.
- La respuesta indica de forma verificable lockReleased y assignmentReleased.
- Una liberación normal produce una señal única y no genera falso lock-released tras restart del watcher.
- Un lease expirado recupera lock, assignment y suscripción de forma consistente.
- El estado reporta active=0 después del cierre normal sin esperar al GC.
