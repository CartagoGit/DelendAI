---
id: x00526
title: "Verify and enforce live develop branch protection"
kind: fix
status: done
type: proposal
track: governance
date: 2026-09-07
last-transition-id: 1ce7e108-b045-4450-98b6-835f4193123d
last-correlation-id: 1ce7e108-b045-4450-98b6-835f4193123d
last-transition-from: in-progress
shipped-in: ["ef700d890", "d590cefef"]
---

# x00526 — Verify and enforce live develop branch protection

## Goal

Hacer que el estado de `develop` se compruebe contra la API real de GitHub y que la política no permita bypass genérico para agentes o bots; separar claramente el check de configuración del check de protección efectiva.

## why

La configuración declarativa y el check local pueden estar verdes mientras GitHub devuelve develop protegida=false, dejando una falsa sensación de seguridad.

## non-goals

- No proteger main dentro de este trabajo.
- No almacenar credenciales en el repositorio.
- No conceder bypass general a Copilot, Renovate u otros bots.
- No sustituir la política de required checks agregada ya existente.

## Slices

- global_gate: e2e

### S1 — Guard live contra GitHub y contrato de bypass
- **Status**: done
- **Files**: `tools/scripts/lint/branch-protection-guard.script.ts`, `.github/settings.yml`, `tools/scripts/lint/branch-protection-guard.spec.ts`
- **Gate**: type
- acceptance:
  - "El modo live consulta la protección real de develop y falla cuando la API devuelve protected=false o una policy divergente."
  - "El modo declarativo se identifica como validación de configuración, no como protección efectiva."
  - "La política no incluye bypass general para agentes ni bots; cualquier excepción está explícitamente limitada al integrador autorizado."
  - "Hay tests para rama no protegida, checks divergentes y policy válida."
- review-state: done
- review-implementer: Carthage
- review-reviewer: Assyria
- review-log: approved by Assyria — Revisión independiente aprobada: ef700d890 está publicado; guard live, cuatro tests focalizados, typecheck de tools y Biome pasan. La política no contiene bypass general y protected=false falla explícitamente.
### S2 — CI ejecuta la verificación real y nombra los checks sin ambigüedad
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `.github/workflows/ci.yml`, `docs/delendai/GOVERNANCE-BRANCH-PROTECTION.md`
- **Gate**: e2e
- acceptance:
  - "CI ejecuta el guard live cuando existen credenciales GitHub y falla de forma explícita si develop no está protegida."
  - "El check declarativo y el check live tienen nombres distintos y no inducen a confundir configuración con estado real."
  - "La documentación describe el único flujo de integración permitido y la ausencia de bypass general."
- review-state: done
- review-implementer: Carthage
- review-reviewer: Phoenicia
- review-log: approved by Phoenicia — Revisión independiente aprobada: d590cefef está publicado; el workflow parser no reporta findings, el job develop-protection-live está presente, el guard y sus tests pasan y la documentación distingue declaration/live sin bypass general.
## acceptance

- El modo live consulta la protección real de develop y falla cuando la API devuelve protected=false o una policy divergente.
- El modo declarativo se identifica como validación de configuración, no como protección efectiva.
- La política no incluye bypass general para agentes ni bots; cualquier excepción está explícitamente limitada al integrador autorizado.
- Hay tests para rama no protegida, checks divergentes y policy válida.
- CI ejecuta el guard live cuando existen credenciales GitHub y falla de forma explícita si develop no está protegida.
- El check declarativo y el check live tienen nombres distintos y no inducen a confundir configuración con estado real.
- La documentación describe el único flujo de integración permitido y la ausencia de bypass general.
