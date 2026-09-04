---
id: x00214
title: "error-reporting: reporte por construcción con DTO seguro (sin Error/stack/args/message crudos)"
kind: fix
status: done
type: proposal
track: privacy
date: 2026-08-24
---

# x00214 — error-reporting: reporte por construcción con DTO seguro (sin Error/stack/args/message crudos)

## Goal

Rediseñar el pipeline de `@mcp-vertex/error-reporting` para que sea **técnicamente imposible** construir una issue que contenga datos del proyecto consumidor.

Parte del plan orquestador `q00003`. Referencias legadas (auditoría externa `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §2 ER-001 — pipeline MCP-Vertex-only y DTO `ISafeMcpVertexReport`
- §2 ER-003 — no enviar `error.message` crudo (catálogo de mensajes seguros)
- §2 ER-004 — no enviar stack completo (solo frames `@mcp-vertex/*` normalizados a package-relative)
- §2 ER-006 — `validateSafeReport` deny-by-default antes de cualquier envío
- §32 — pipeline seguro de 18 pasos
- §35 LOG-PRIV-001..004 — log local ≠ report público; nunca reutilizar el mismo objeto
- §30 — clases de datos A/B/C/D; solo clase A es transmisible

La implementación actual (`f00158`, propuesta existente) crea issues con stack+log. Este trabajo endurece ese flujo hacia el modelo DTO-only: el módulo que ejecuta `gh issue create` (o cualquier reporter HTTP futuro) debe aceptar **solamente** `ISafeMcpVertexReport`; los campos `message`, `stack`, `args`, `workspace`, `cwd`, `path`, `repo`, `hostName` quedan prohibidos a nivel de tipo y de runtime.

El DTO incluye `classification: IssueClassification` (taxonomía canónica de 14 valores: `BUG`, `REGRESSION`, `SECURITY`, `PRIVACY`, `PERFORMANCE`, `TOKEN_REGRESSION`, `DOC_DRIFT`, `CONFIG_DRIFT`, `DUPLICATE`, `NOT_A_BUG`, `DESIGN_DECISION`, `PRODUCT_DECISION`, `NEEDS_REPRODUCTION`, `UNKNOWN`), asignada en el momento de crear la issue.

**Regla de proyecto inviolable:** los datos del usuario/empresa NO son combustible de diagnóstico. Ante cualquier duda NO se envía (fail-closed).

## why

Riesgo legal y de privacidad crítico (§1.1 de la auditoría): hoy los `args` pasan por `redactSecrets()` pero `message` y `stack` se incorporan sin redactor, pudiendo filtrar rutas locales, nombres de repos, URLs, tokens y credenciales. Como el reporting sigue activo por defecto (decisión de producto), la frontera de privacidad debe estar en la arquitectura y no en una opción configurable del usuario.

## non-goals

- No desactivar el reporting por defecto (la decisión de producto es default-on).
- No recopilar telemetría del proyecto ni contexto del usuario.
- No tocar issues-triage (plugin privado) — esto es solo el emisor de issues.
- No sustituir el redactor centralizado: se mantiene como defensa en profundidad, no como frontera primaria.

## Slices

- global_gate: e2e

### S1 — DTO seguro y boundary del reporter
- **Status**: done
- **Files**: `plugins/error-reporting/src/lib/contracts/interfaces/reporter.interface.ts`, `plugins/error-reporting/src/lib/reporter.service.ts`
- **Gate**: e2e
- acceptance:
  - "El reporter no acepta Error/args/stack/workspace/cwd/strings arbitrarias; solo ISafeMcpVertexReport."
  - "Los tipos prohíben message/stack/args/workspace/path/repo/cwd/hostName en tiempo de compilación."
  - "Existe McpVertexInternalError con code/packageId/componentId/safeContext tipado (SafeScalar)."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Frame extractor + normalización package-relative
- **Status**: done
- **Files**: `plugins/error-reporting/src/lib/frame-extractor.helper.ts`, `plugins/error-reporting/src/lib/contracts/interfaces/safe-frame.interface.ts`
- **Gate**: type
- acceptance:
  - "Solo se extraen frames @mcp-vertex/*."
  - "Las rutas se normalizan a @mcp-vertex/<package>/<file>:<line>:<col>."
  - "Nunca se conservan /Users/* /home/* C:\Users\* workspace root node_modules parent repo root."

### S3 — Privacy validator deny-by-default
- **Status**: done
- **Files**: `plugins/error-reporting/src/lib/privacy-validator.helper.ts`
- **Gate**: type
- acceptance:
  - "validateSafeReport rechaza paths absolutos/Windows, URLs no allowlisted, emails, IPs, UUIDs externos, tokens/JWT/Authorization, .git, branches, SQL/JSON/XML arbitrarios, strings excesivamente largas."
  - "Si el validator duda -> NO envía y registra localmente 'report blocked by privacy validator: <reason code>'."

### S4 — Wiring del pipeline de 18 pasos en el hook
- **Status**: done
- **Files**: `plugins/error-reporting/src/index.ts`, `plugins/error-reporting/src/lib/signature.helper.ts`
- **Gate**: e2e
- acceptance:
  - "El hook ejecuta: capturar -> clasificar -> extraer frames -> desechar message/stack/args/result/cwd -> fingerprint -> ejemplo sintético -> redactor -> validator -> serializar -> revalidar -> enviar."
  - "El report público se construye desde cero; nunca reutiliza el objeto de log local (LOG-PRIV-002)."

## acceptance

- El reporter no acepta Error/args/stack/workspace/cwd/strings arbitrarias; solo ISafeMcpVertexReport.
- Los tipos prohíben message/stack/args/workspace/path/repo/cwd/hostName en tiempo de compilación.
- Existe McpVertexInternalError con code/packageId/componentId/safeContext tipado (SafeScalar).
- Solo se extraen frames @mcp-vertex/*.
- Las rutas se normalizan a @mcp-vertex/<package>/<file>:<line>:<col>.
- Nunca se conservan /Users/* /home/* C:\Users\* workspace root node_modules parent repo root.
- validateSafeReport rechaza paths absolutos/Windows, URLs no allowlisted, emails, IPs, UUIDs externos, tokens/JWT/Authorization, .git, branches, SQL/JSON/XML arbitrarios, strings excesivamente largas.
- Si el validator duda -> NO envía y registra localmente 'report blocked by privacy validator: <reason code>'.
- El hook ejecuta: capturar -> clasificar -> extraer frames -> desechar message/stack/args/result/cwd -> fingerprint -> ejemplo sintético -> redactor -> validator -> serializar -> revalidar -> enviar.
- El report público se construye desde cero; nunca reutiliza el objeto de log local (LOG-PRIV-002).
