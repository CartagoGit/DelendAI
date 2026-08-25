---
id: x00216
title: "error-reporting: dedupe por lastSuccessAt + rate limits y circuit breaker"
kind: fix
status: done
type: proposal
track: privacy
date: 2026-08-24
---

# x00216 — error-reporting: dedupe por lastSuccessAt + rate limits y circuit breaker

## Goal

Corregir la semántica de deduplicación y añadir límites de frecuencia al reporting automático.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §2 ER-008 — separar `lastAttemptAt` de `lastSuccessAt`
- §34 ER-010 — rate limits: max issues/instalación/día, dedupe global, backoff, sin retry loop agresivo, circuit breaker
- §34 ER-011 — antes de crear issue nueva: buscar fingerprint existente y comentar/actualizar solo con datos seguros, o incrementar contador local
- §36 ER-NET-004 — timeouts/backoff

Modelo objetivo:

```ts
interface IReportRecord {
  fingerprint: string;
  attemptCount: number;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastFailureCode?: SafeReporterFailureCode;
  issueNumber?: number;
}
```

La deduplicación pública usa `lastSuccessAt` (un envío fallido NO debe bloquear reintentos durante toda la ventana).

## why

Hoy `submitIssue()` registra la firma aunque el envío falle, por lo que un fallo de red bloquea el reintento durante 24h. Además, sin rate limits un bucle de errores podría saturar el repo objetivo con issues.

## non-goals

- No cambiar el fingerprint (cubierto por la propuesta de clasificación interna).
- No exponer el store local como API pública.
- No persistir contenido de errores en el store: solo contadores/códigos seguros.

## Slices

- global_gate: type

### S1 — Store con attempt/success separados
- **Status**: done
- **Files**: `plugins/error-reporting/src/lib/contracts/interfaces/report-store.interface.ts`, `plugins/error-reporting/src/lib/report-store.service.ts`
- **Gate**: type
- acceptance:
  - "IReportRecord incluye attemptCount, lastAttemptAt, lastSuccessAt, lastFailureCode, issueNumber."
  - "shouldReport() usa lastSuccessAt para la ventana de deduplicación."
  - "Un envío fallido (sin red/gh) no bloquea el reintento durante la ventana."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Rate limits, backoff y circuit breaker
- **Status**: done
- **Files**: `plugins/error-reporting/src/lib/report-scheduler.helper.ts`
- **Gate**: type
- acceptance:
  - "max issues/instalación/día configurable y aplicado."
  - "Backoff exponencial con jitter y sin retry loop agresivo."
  - "Circuit breaker abre tras N fallos consecutivos y recierra con backoff."
  - "Antes de crear issue nueva se busca el fingerprint existente para comentar/actualizar solo con datos seguros."

### S3 — El MISMO error deduplica aunque los datos difieran (el tipo NO es el error)
- **Status**: done
- **Files**: `plugins/error-reporting/src/lib/report-store.service.ts`, `plugins/error-reporting/src/lib/signature.helper.ts`
- **Gate**: type
- acceptance:
  - "El MISMO error (misma identidad: packageId + componentId + errorCode + frame interno) colapsa en una única issue aunque los datos de runtime (mensaje, args, valores) difieran."
  - "Antes de crear issue se busca el fingerprint del MISMO error y se incrementa su contador; nunca se crean N issues para el mismo error."
  - "Un mismo TIPO de error no es el mismo error: dos bugs distintos que comparten errorCode pero difieren en ubicación producen fingerprints distintos y NO colapsan."

## acceptance

- IReportRecord incluye attemptCount, lastAttemptAt, lastSuccessAt, lastFailureCode, issueNumber.
- shouldReport() usa lastSuccessAt para la ventana de deduplicación.
- Un envío fallido (sin red/gh) no bloquea el reintento durante la ventana.
- max issues/instalación/día configurable y aplicado.
- Backoff exponencial con jitter y sin retry loop agresivo.
- Circuit breaker abre tras N fallos consecutivos y recierra con backoff.
- Antes de crear issue nueva se busca el fingerprint existente para comentar/actualizar solo con datos seguros.
- El MISMO error (no el mismo tipo) colapsa en una única issue aunque los datos difieran; bugs distintos del mismo tipo no se mezclan.
