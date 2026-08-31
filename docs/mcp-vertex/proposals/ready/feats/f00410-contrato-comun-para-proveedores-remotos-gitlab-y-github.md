---
id: f00410
title: "Contrato común para proveedores remotos GitLab y GitHub"
kind: feat
status: ready
type: proposal
track: remote-providers-foundation
date: 2026-08-31
---

# f00410 — Contrato común para proveedores remotos GitLab y GitHub

## Goal

Definir la base agnóstica para proveedores remotos HTTP sin acoplarlos al plugin git: configuración validada, cliente testeable, autenticación, errores normalizados, paginación, límites, retries, rate limits, redacción, enlaces, outputs compactos y compatibilidad con GitLab self-managed y GitHub Enterprise.

## why

GitLab y GitHub comparten transporte, seguridad y límites operativos, pero sus recursos remotos deben permanecer independientes del plugin git y específicos donde corresponda. Un contrato común evita clientes duplicados y errores inconsistentes.

## non-goals

- Implementar recursos concretos de GitLab o GitHub.
- Añadir lógica HTTP específica de proveedores al plugin git.
- Persistir tokens, secretos o respuestas remotas completas.
- Crear operaciones mutables.

## Slices

- global_gate: type

### S1 — Contratos, configuración y cliente HTTP hermético
- **Status**: pending
- **Files**: `packages/contracts/src/remote-provider.ts`, `plugins/remote-provider-core/src/index.ts`, `plugins/remote-provider-core/src/lib/http-client.ts`, `plugins/remote-provider-core/src/lib/config.ts`, `plugins/remote-provider-core/tests/http-client.spec.ts`
- **Gate**: type
- acceptance:
  - "Tipos compartidos para proveedor, proyecto/repositorio, refs, paginación, rate limits, errores normalizados y resultados truncados."
  - "fetch, reloj y backoff inyectables; tests sin red real."
  - "Diferencia 401, 403, 404, 429, timeout, transitorio, incompatibilidad de API y respuesta inválida."
  - "Precedencia explícita de configuración y tokens nunca persistidos."

### S2 — Redacción, límites, SSRF y documentación de frontera
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/remote-provider-core/src/lib/redaction.ts`, `plugins/remote-provider-core/src/lib/limits.ts`, `plugins/remote-provider-core/src/lib/url-policy.ts`, `plugins/remote-provider-core/tests/security.spec.ts`, `plugins/remote-provider-core/README.md`
- **Gate**: type
- acceptance:
  - "Tokens, cabeceras, variables sensibles y secretos se redactan en errores, logs, snapshots y outputs."
  - "Límites de bytes, líneas, tiempo, artefactos y paginación aplicados de forma verificable."
  - "URLs configurables protegidas contra SSRF y hosts de GitLab self-managed/GitHub Enterprise validados."
  - "Retries solo para errores transitorios; ninguna operación mutable se reintenta automáticamente."
  - "La documentación afirma: GitLab y GitHub no dependen del plugin git; git solo aporta contexto local genérico de forma opcional."

## acceptance

- Tipos compartidos para proveedor, proyecto/repositorio, refs, paginación, rate limits, errores normalizados y resultados truncados.
- fetch, reloj y backoff inyectables; tests sin red real.
- Diferencia 401, 403, 404, 429, timeout, transitorio, incompatibilidad de API y respuesta inválida.
- Precedencia explícita de configuración y tokens nunca persistidos.
- Tokens, cabeceras, variables sensibles y secretos se redactan en errores, logs, snapshots y outputs.
- Límites de bytes, líneas, tiempo, artefactos y paginación aplicados de forma verificable.
- URLs configurables protegidas contra SSRF y hosts de GitLab self-managed/GitHub Enterprise validados.
- Retries solo para errores transitorios; ninguna operación mutable se reintenta automáticamente.
- La documentación afirma: GitLab y GitHub no dependen del plugin git; git solo aporta contexto local genérico de forma opcional.
