---
id: f00410
title: "Contrato común para proveedores remotos GitLab y GitHub"
kind: feat
status: done
type: proposal
track: remote-providers-foundation
date: 2026-08-31
shipped-in: ["46173fed9"]
last-transition-id: 08c75f45-b535-482c-9861-79ff2a5f40b0
last-correlation-id: 08c75f45-b535-482c-9861-79ff2a5f40b0
last-transition-from: review
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

## architecture

### Provider activation requirements (English)

To use a remote provider against the repository that contains `mcp-vertex`, the host must explicitly enable the provider plugin and provide access through environment variables or the host configuration. The provider plugin does not require the `git` plugin, a local checkout, or a configured `origin` remote.

### GitHub

- Enable the `github` plugin in the host configuration.
- Set `GITHUB_TOKEN` to a token owned by the user or automation identity running mcp-vertex. The token is read at runtime and must never be committed, persisted, logged, or returned by a tool.
- Set `GITHUB_API_URL` only when using GitHub Enterprise Server; otherwise use the provider default for GitHub.com.
- Provide the repository as `owner` and `repository`, or configure equivalent defaults. For this repository, use the GitHub owner and repository that actually host `mcp-vertex`; do not infer them from the local folder name.
- For read-only inspection, grant the minimum repository metadata, issues, pull requests, Actions/checks, contents, releases, deployments, and security visibility permissions required by the selected tools. A token with write permissions is not required for read-only tools.

### GitLab

- Enable the `gitlab` plugin in the host configuration.
- Set `GITLAB_TOKEN` (or the documented legacy GitLab token variable) to a token owned by the user or automation identity running mcp-vertex. The token is read at runtime and must never be committed, persisted, logged, or returned by a tool.
- Set `GITLAB_URL` for GitLab self-managed; use the provider default for GitLab.com.
- Provide the project as a numeric project ID or URL-encoded namespace/project path, or configure an equivalent default. For this repository, use the GitLab project that actually hosts `mcp-vertex`; do not infer it from the local folder name.
- For read-only inspection, grant the minimum `read_api` and `read_repository` access required by the selected tools. A token with write permissions is not required for read-only tools.

### Local checkout composition

If the host also enables `git`, the agent may combine local context (current branch, commit SHA, diff, remotes, or worktrees) with remote provider data. This is optional composition only: GitHub and GitLab remain usable when `git` is disabled or when no checkout exists.

## Slices

- global_gate: type

### S1 — Contratos, configuración y cliente HTTP hermético
- **Status**: done
- **Files**: `packages/contracts/src/remote-provider.ts`, `plugins/remote-provider-core/src/index.ts`, `plugins/remote-provider-core/src/lib/http-client.ts`, `plugins/remote-provider-core/src/lib/config.ts`, `plugins/remote-provider-core/tests/http-client.spec.ts`
- **Gate**: type
- acceptance:
  - "Tipos compartidos para proveedor, proyecto/repositorio, refs, paginación, rate limits, errores normalizados y resultados truncados."
  - "fetch, reloj y backoff inyectables; tests sin red real."
  - "Diferencia 401, 403, 404, 429, timeout, transitorio, incompatibilidad de API y respuesta inválida."
  - "Precedencia explícita de configuración y tokens nunca persistidos."
- review-state: done
- review-implementer: finch
- review-reviewer: delivery-verifier-f00410-s1
- review-log: approved by delivery-verifier-f00410-s1 — Independent verification: the shared remote-provider contract and HTTP client pass the focused test suite and both package typechecks. Retry boundary is covered, including maxRetries=0 and maxRetries=1. No provider-specific or git-dependent behavior was introduced.
### S2 — Redacción, límites, SSRF y documentación de frontera
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `plugins/remote-provider-core/src/lib/redaction.ts`, `plugins/remote-provider-core/src/lib/limits.ts`, `plugins/remote-provider-core/src/lib/url-policy.ts`, `plugins/remote-provider-core/tests/security.spec.ts`, `plugins/remote-provider-core/README.md`
- **Gate**: type
- acceptance:
  - "Tokens, cabeceras, variables sensibles y secretos se redactan en errores, logs, snapshots y outputs."
  - "Límites de bytes, líneas, tiempo, artefactos y paginación aplicados de forma verificable."
  - "URLs configurables protegidas contra SSRF y hosts de GitLab self-managed/GitHub Enterprise validados."
  - "Retries solo para errores transitorios; ninguna operación mutable se reintenta automáticamente."
  - "La documentación afirma: GitLab y GitHub no dependen del plugin git; git solo aporta contexto local genérico de forma opcional."
- review-state: done
- review-implementer: finch
- review-reviewer: delivery-verifier-f00410-s2
- review-log: approved by delivery-verifier-f00410-s2 — Independent verification: security, limits, redaction, URL policy and English activation documentation passed 42 focused tests. Package typechecks and diff check are clean. Commit 46173fed9b465053bf43f29456164bac9cdbfae1 contains the implementation.
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
