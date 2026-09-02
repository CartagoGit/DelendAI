---
id: f00415
title: "Diagnóstico reutilizable de pipelines y workflows remotos"
kind: feat
status: in-progress
type: proposal
track: remote-ci-diagnostics
date: 2026-08-31
last-transition-id: 767c5784-9236-4d06-852f-dade07fa488d
last-correlation-id: 767c5784-9236-4d06-852f-dade07fa488d
last-transition-from: ready
---

# f00415 — Diagnóstico reutilizable de pipelines y workflows remotos

## Goal

Definir un flujo operativo agnóstico para reconstruir fallos de GitLab pipelines y GitHub workflows con evidencia limitada, correlacionando commit, revisión, branch/ref, ejecución, jobs, logs y artefactos, y separando diagnóstico de cualquier mutación.

## why

El valor principal para el agente no es solo listar ejecuciones: necesita localizar jobs fallidos, recuperar evidencia limitada, explicar causas probables y proponer una corrección sin acoplarse a un proveedor ni a un checkout local.

## non-goals

- Ejecutar cambios sin confirmación.
- Duplicar clientes HTTP de cada proveedor.
- Hacer que el diagnóstico dependa de logs, proposals, quality o notification.
- Descargar artefactos o logs sin límites.

## architecture

### Activation and access requirements (English)

The diagnostic flow requires one configured remote provider and does not require the `git` plugin or a local checkout. To diagnose the repository that hosts `mcp-vertex`, configure the real GitHub `owner/repository` or GitLab `project` explicitly, together with the provider token and API URL required by the corresponding provider proposal.

- GitHub requires `GITHUB_TOKEN`; GitHub Enterprise Server may additionally require `GITHUB_API_URL`.
- GitLab requires `GITLAB_TOKEN` or the supported legacy token variable; GitLab self-managed may additionally require `GITLAB_URL`.
- Use the smallest read-only permissions needed to retrieve the selected run, failed jobs, bounded logs, checks, reviews, commits, and artifact metadata. The diagnostic flow must not require write permissions.
- Keep tokens in the process environment or approved secret injection mechanism. Never put them in configuration committed to the repository, prompts, proposals, logs, snapshots, evidence, or diagnostic output.
- If `git` is enabled and a checkout exists, the orchestrator may add local branch, SHA, diff, and remote context. This improves correlation but is optional and must not block remote-only diagnosis.
- Any retry, comment, dispatch, cancellation, or other corrective action remains outside diagnosis and requires the separate mutation capability plus explicit confirmation.

The diagnostic result must identify whether evidence is complete, partial, or unavailable and must preserve useful web/API links without exposing credentials.

## Slices

- global_gate: type

### S1 — Modelo de evidencia y motor de diagnóstico
- **Status**: pending
- **DependsOn**: [f00410:S1, f00410:S2]
- **Files**: `packages/contracts/src/remote-diagnostics.ts`, `plugins/remote-provider-core/src/lib/diagnostics.ts`, `plugins/remote-provider-core/tests/diagnostics.spec.ts`
- **Gate**: type
- acceptance:
  - "Flujo: resolver proveedor/recurso, última ejecución, ejecución completa, jobs fallidos, logs relevantes, límites, correlación y diagnóstico con evidencia."
  - "Modelo tipado incluye commit, review, branch/ref, run, job, artefactos, errores resumidos y detalles truncados."
  - "Distingue evidencia ausente, parcial y completa; nunca requiere checkout local."
  - "Tests cubren logs grandes, timeout, jobs múltiples y respuesta parcial sin red real."

### S2 — Adaptadores GitLab/GitHub e integración conceptual
- **Status**: pending
- **DependsOn**: [f00411:S2, f00412:S2, f00415:S1]
- **Files**: `plugins/gitlab/src/lib/diagnostics.ts`, `plugins/github/src/lib/diagnostics.ts`, `plugins/remote-provider-core/README.md`, `docs/mcp-vertex/remote-providers.md`
- **Gate**: type
- acceptance:
  - "Reconstruye un pipeline GitLab o workflow GitHub fallido con evidencia limitada y URLs útiles."
  - "Integra conceptualmente logs, proposals, quality y notification sin importaciones obligatorias ni dependencias de runtime."
  - "Documenta composición opcional git+gitlab o git+github y mantiene proveedores utilizables sin git."
  - "Incluye propuesta de corrección separada de retry/comentario/cambio confirmado."

### S3 — Pruebas de aceptación y gate de entrega
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `plugins/remote-provider-core/tests/diagnostics-e2e.spec.ts`, `plugins/gitlab/tests/diagnostics.spec.ts`, `plugins/github/tests/diagnostics.spec.ts`, `tools/scripts/verify/remote-provider-verify.script.ts`
- **Gate**: e2e
- acceptance:
  - "Verifica schemas, truncación, redacción, correlación y ausencia de red real."
  - "Comprueba GitLab.com/self-managed y GitHub.com/Enterprise mediante fixtures de host."
  - "Verifica que los plugins funcionan sin git y que el contexto local es opcional."
  - "Entrega un reporte de diagnóstico reproducible y un gate verificable."

## acceptance

- Flujo: resolver proveedor/recurso, última ejecución, ejecución completa, jobs fallidos, logs relevantes, límites, correlación y diagnóstico con evidencia.
- Modelo tipado incluye commit, review, branch/ref, run, job, artefactos, errores resumidos y detalles truncados.
- Distingue evidencia ausente, parcial y completa; nunca requiere checkout local.
- Tests cubren logs grandes, timeout, jobs múltiples y respuesta parcial sin red real.
- Reconstruye un pipeline GitLab o workflow GitHub fallido con evidencia limitada y URLs útiles.
- Integra conceptualmente logs, proposals, quality y notification sin importaciones obligatorias ni dependencias de runtime.
- Documenta composición opcional git+gitlab o git+github y mantiene proveedores utilizables sin git.
- Incluye propuesta de corrección separada de retry/comentario/cambio confirmado.
- Verifica schemas, truncación, redacción, correlación y ausencia de red real.
- Comprueba GitLab.com/self-managed y GitHub.com/Enterprise mediante fixtures de host.
- Verifica que los plugins funcionan sin git y que el contexto local es opcional.
- Entrega un reporte de diagnóstico reproducible y un gate verificable.
