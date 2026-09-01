---
id: x00215
title: "error-reporting: clasificación interna estricta por evidencia positiva de origen MCP Vertex"
kind: fix
status: done
type: proposal
track: privacy
date: 2026-08-24
---

# x00215 — error-reporting: clasificación interna estricta por evidencia positiva de origen MCP Vertex

## Goal

Sustituir la heurística actual de `isMcpVertexInternal` (substrings `mcp-vertex`/`@mcp-vertex`/`/packages/core/`/`/plugins/`) por una clasificación por **evidencia positiva**.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §2 ER-002 — clasificación fuerte de "error interno"
- §33 — diseño del fingerprint (estable, sin datos de usuario)

Un error solo es reportable si se cumple al menos una condición fuerte:

1. El frame pertenece a una ruta del paquete instalado `@mcp-vertex/*`.
2. El frame pertenece a una ruta interna registrada durante el arranque del runtime.
3. El error fue creado mediante `McpVertexInternalError` (clase propia).
4. El error transporta un `mcpVertexErrorCode` emitido por código propio.
5. Existe un boundary interno que captura el error antes de mezclarse con errores del host.

Fingerprint = `sha256(mcpVertexVersionMajorMinor + packageId + componentId + errorCode + topInternalFrameRelative)`. Nunca incluir `message`, `args`, path de proyecto, repo, remote o branch.

**Taxonomía canónica de issues** (grabada a fuego, asignada al CREAR la issue, no después): `BUG`, `REGRESSION`, `SECURITY`, `PRIVACY`, `PERFORMANCE`, `TOKEN_REGRESSION`, `DOC_DRIFT`, `CONFIG_DRIFT`, `DUPLICATE`, `NOT_A_BUG`, `DESIGN_DECISION`, `PRODUCT_DECISION`, `NEEDS_REPRODUCTION`, `UNKNOWN`. Las clases de decisión (`DESIGN_DECISION`, `PRODUCT_DECISION`, `NEEDS_REPRODUCTION`, `UNKNOWN`) fuerzan una pregunta al humano en lugar de una propuesta automática.

**Regla:** "no sé si esto es nuestro" → no se envía.

## why

El marcador `/plugins/` es excesivamente genérico: un consumidor con `/home/empresa/proyecto/plugins/auth/index.ts` vería su fallo clasificado como interno. Errores tipados (`McpVertexInternalError`) permiten reportar solo lo que el propio código sabe que es suyo, en lugar de adivinar leyendo strings.

## non-goals

- No cambiar el resto del pipeline DTO (cubierto por la propuesta hermana de pipeline).
- No introducir un LLM ni análisis semántico de mensajes.
- No perseguir cobertura perfecta de errores no tipados: ante duda, local-only.

## Slices

- global_gate: type

### S1 — Errores tipados: códigos y clase
- **Status**: done
- **Files**: `plugins/error-reporting/src/lib/contracts/constants/error-codes.constant.ts`, `plugins/error-reporting/src/lib/mcp-internal-error.helper.ts`
- **Gate**: type
- acceptance:
  - "McpVertexErrorCode cubre las clases de fallo internas conocidas (PLUGIN_REGISTER_TIMEOUT, etc.)."
  - "McpVertexInternalError expone code/packageId/componentId/safeContext inmutable."
  - "La taxonomía de clasificación de issues (14 valores) vive como constante tipada `IssueClassification`."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Clasificador por evidencia positiva
- **Status**: done
- **Files**: `plugins/error-reporting/src/lib/internal-classifier.helper.ts`
- **Gate**: type
- acceptance:
  - "Solo clasifica interno ante frame @mcp-vertex/*, ruta interna registrada, McpVertexInternalError o mcpVertexErrorCode propio."
  - "El path /home/empresa/proyecto/plugins/auth/index.ts NO clasifica como interno (test)."
  - "Errores no tipados se almacenan localmente y no se transmiten si hay duda."
  - "El clasificador asigna la clase de issue (BUG/REGRESSION/SECURITY/PRIVACY/PERFORMANCE/TOKEN_REGRESSION/DOC_DRIFT/CONFIG_DRIFT/DUPLICATE/NOT_A_BUG/DESIGN_DECISION/PRODUCT_DECISION/NEEDS_REPRODUCTION/UNKNOWN) en el momento de crear la issue."

### S3 — Fingerprint estable sin datos de usuario
- **Status**: done
- **Files**: `plugins/error-reporting/src/lib/signature.helper.ts`
- **Gate**: type
- acceptance:
  - "fingerprint = sha256(versionMajorMinor + packageId + componentId + errorCode + topInternalFrameRelative)."
  - "No incluye message/args/project path/repo/remote/branch."
  - "Dos proyectos con el mismo bug interno producen el mismo fingerprint."

## acceptance

- McpVertexErrorCode cubre las clases de fallo internas conocidas (PLUGIN_REGISTER_TIMEOUT, etc.).
- McpVertexInternalError expone code/packageId/componentId/safeContext inmutable.
- Solo clasifica interno ante frame @mcp-vertex/*, ruta interna registrada, McpVertexInternalError o mcpVertexErrorCode propio.
- El path /home/empresa/proyecto/plugins/auth/index.ts NO clasifica como interno (test).
- Errores no tipados se almacenan localmente y no se transmiten si hay duda.
- fingerprint = sha256(versionMajorMinor + packageId + componentId + errorCode + topInternalFrameRelative).
- No incluye message/args/project path/repo/remote/branch.
- Dos proyectos con el mismo bug interno producen el mismo fingerprint.
