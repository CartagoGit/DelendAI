---
id: f00160
title: "error-reporting: report_status transparente, opt-out simple y destino allowlisted"
kind: feat
status: done
type: proposal
track: privacy
date: 2026-08-24
shipped-in:
  - 37a63672 # chore(proposals): mover 17 propuestas completadas a review
  - 6c24c316 # feat(error-reporting): f00160 — report_status transparente, opt-out y destino allowlisted
---

# f00160 — error-reporting: report_status transparente, opt-out simple y destino allowlisted

## Goal

Hacer transparente y auditable el reporting automático sin convertirlo en opt-in.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §2 ER-009 — notice claro, opt-out simple, sin opt-in
- §36 ER-NET-001..003 — destino fijo/allowlisted, no aceptar `targetRepo` desde datos del proyecto, no reenviar headers/env del proyecto
- §1.1 — invariante de producto
- §30 — clases de datos A/B/C/D

Entregables:

- `report_status` describe exactamente qué campos se pueden enviar y afirma que no se envía contenido del proyecto, e incluye la `classification` (taxonomía canónica de 14 valores) de cada reporte local registrado.
- Config simple para deshabilitar (`options.enabled = false`), ya existente, documentada.
- El destino es fijo y allowlisted: el `targetRepo` nunca se deriva de datos del proyecto salvo configuración explícita del operador.
- Documentación visible (README + knowledge) con la política de privacidad y los campos transmitidos.
- Checklist legal explícita para revisión previa a publicación (este documento no es asesoramiento legal).

## why

Mantener default-on exige transparencia: el usuario debe poder ver qué se envía, deshabilitarlo con una línea, y confiar en que el destino no se deriva de su proyecto. Sin esto, el reporting automático es un riesgo reputacional y legal aunque el payload sea seguro.

## non-goals

- No convertir el reporting en opt-in (decisión de producto: default-on).
- No emitir asesoramiento legal.
- No añadir métricas de uso del usuario.

## Slices

- global_gate: type

### S1 — report_status con catálogo exacto de campos
- **Status**: done
- **Files**: `plugins/error-reporting/src/lib/tools/report-status.tool.ts`, `plugins/error-reporting/src/lib/contracts/interfaces/report-status.interface.ts`
- **Gate**: type
- acceptance:
  - "report_status enumera exactamente los campos transmitidos y afirma que no se envía contenido del proyecto."
  - "Muestra el estado habilitado/deshabilitado, el destino allowlisted y la classification de cada reporte local (taxonomía de 14 valores)."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Destino fijo y allowlist de red
- **Status**: done
- **Files**: `plugins/error-reporting/src/lib/contracts/constants/options.constant.ts`, `plugins/error-reporting/src/lib/contracts/interfaces/options.interface.ts`
- **Gate**: type
- acceptance:
  - "targetRepo solo se acepta desde configuración explícita del operador, nunca desde datos del proyecto."
  - "No se reenvían headers/env del proyecto en el envío."

### S3 — Documentación de privacidad y checklist legal
- **Status**: done
- **Files**: `plugins/error-reporting/README.md`, `plugins/error-reporting/src/lib/knowledge/error-reporting.ts`
- **Gate**: lint
- acceptance:
  - "README documenta política de privacidad, campos transmitidos y cómo deshabilitar."
  - "Knowledge incluye la checklist legal (política, bases legales, IP, retención, metadatos de GitHub/CLI)."
  - "Se afirma explícitamente que no se recopila contexto del usuario/proyecto."

## acceptance

- report_status enumera exactamente los campos transmitidos y afirma que no se envía contenido del proyecto.
- Muestra el estado habilitado/deshabilitado y el destino allowlisted.
- targetRepo solo se acepta desde configuración explícita del operador, nunca desde datos del proyecto.
- No se reenvían headers/env del proyecto en el envío.
- README documenta política de privacidad, campos transmitidos y cómo deshabilitar.
- Knowledge incluye la checklist legal (política, bases legales, IP, retención, metadatos de GitHub/CLI).
- Se afirma explícitamente que no se recopila contexto del usuario/proyecto.
