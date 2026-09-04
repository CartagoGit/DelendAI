---
id: f00413
title: "Operaciones mutables controladas para proveedores remotos"
kind: feat
status: in-progress
type: proposal
track: remote-provider-mutations
date: 2026-08-31
last-transition-id: 53c34272-9b04-4a07-b1ba-8e8ad0c075ed
last-correlation-id: 53c34272-9b04-4a07-b1ba-8e8ad0c075ed
last-transition-from: ready
---

# f00413 — Operaciones mutables controladas para proveedores remotos

## Goal

Añadir capacidades de escritura separadas y desactivadas por defecto para GitLab y GitHub, con confirmación explícita, auditoría, redacción, idempotencia y resultados tipados verificables.

## why

Los comentarios, retries, dispatches y cancelaciones tienen efectos externos y no deben mezclarse con la superficie read-only ni ejecutarse por accidente.

## non-goals

- Habilitar mutaciones por defecto.
- Escribir secrets o variables sensibles desde una herramienta genérica.
- Reintentar automáticamente operaciones mutables.
- Mover operaciones locales al plugin git.

## architecture

### Activation and access requirements (English)

Mutation tools are a separate capability and must remain disabled unless the host explicitly enables them and the user confirms each operation. Enabling GitHub or GitLab read-only access is not sufficient to enable mutations.

- Configure the provider exactly as described by the GitHub or GitLab read-only proposal, including the real repository/project that hosts `delendai`.
- Use a token with the minimum write permission for the selected operation only. Do not use a broad administrator token when a narrower repository or project token is sufficient.
- Require `confirm: true` for every mutation. The handler must reject the request before making an HTTP call when confirmation is absent or does not match the requested effect.
- Keep mutation tools separately configured from read-only tools, make their availability visible in the activation result, and never infer write capability from token presence.
- Record a redacted audit receipt containing provider, repository/project, resource, requested effect, actor, timestamp, and remote result. Never record tokens, secret values, sensitive variables, or authorization headers.
- Do not require the `git` plugin. A local checkout may be used for optional correlation, but it must not authorize or execute a remote mutation.

## Slices

- global_gate: type

### S1 — Consentimiento, auditoría e idempotencia común
- **Status**: pending
- **DependsOn**: [f00410:S1, f00410:S2]
- **Files**: `packages/contracts/src/remote-mutations.ts`, `plugins/remote-provider-core/src/lib/mutations.ts`, `plugins/remote-provider-core/tests/mutations.spec.ts`
- **Gate**: type
- acceptance:
  - "Toda mutación exige confirm:true y se rechaza antes de cualquier request si falta."
  - "Describe efecto, proveedor, recurso, actor y audit receipt sin incluir tokens/secrets."
  - "No hace retries automáticos; protege duplicación de tags/releases y ofrece resultado tipado verificable."
  - "Registra auditoría redaccionada y limita inputs/outputs."

### S2 — Adaptadores mutables GitLab y GitHub
- **Status**: pending
- **DependsOn**: [f00411:S2, f00412:S2, f00413:S1]
- **Files**: `plugins/gitlab/src/lib/mutations.ts`, `plugins/gitlab/src/lib/tools/write-tools.ts`, `plugins/github/src/lib/mutations.ts`, `plugins/github/src/lib/tools/write-tools.ts`
- **Gate**: type
- acceptance:
  - "GitLab cubre issues, comentarios/discusiones, retry pipeline/job, cancelación y releases/tags solo donde estén especificados."
  - "GitHub cubre issues/comentarios, dispatch de workflows, releases/tags y operaciones equivalentes soportadas por API."
  - "Las capacidades write están separadas o desactivadas por configuración y nunca se exponen como read-only."
  - "Confirmación, permisos insuficientes y duplicados devuelven errores normalizados."

### S3 — Tests de mutaciones y documentación
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `plugins/gitlab/tests/src/lib/mutations.spec.ts`, `plugins/gitlab/tests/src/lib/write-tools.spec.ts`, `plugins/github/tests/src/lib/write-tools.spec.ts`, `plugins/remote-provider-core/README.md`
- **Gate**: type
- acceptance:
  - "Cubre confirmación ausente, retry/dispatch confirmado, 401/403/429, no-retry automático, auditoría y redacción."
  - "Los handlers respetan inputSchema/outputSchema y no usan red real."
  - "Documenta permisos mínimos, rollback operativo y que no se escriben secrets."

## acceptance

- Toda mutación exige confirm:true y se rechaza antes de cualquier request si falta.
- Describe efecto, proveedor, recurso, actor y audit receipt sin incluir tokens/secrets.
- No hace retries automáticos; protege duplicación de tags/releases y ofrece resultado tipado verificable.
- Registra auditoría redaccionada y limita inputs/outputs.
- GitLab cubre issues, comentarios/discusiones, retry pipeline/job, cancelación y releases/tags solo donde estén especificados.
- GitHub cubre issues/comentarios, dispatch de workflows, releases/tags y operaciones equivalentes soportadas por API.
- Las capacidades write están separadas o desactivadas por configuración y nunca se exponen como read-only.
- Confirmación, permisos insuficientes y duplicados devuelven errores normalizados.
- Cubre confirmación ausente, retry/dispatch confirmado, 401/403/429, no-retry automático, auditoría y redacción.
- Los handlers respetan inputSchema/outputSchema y no usan red real.
- Documenta permisos mínimos, rollback operativo y que no se escriben secrets.
