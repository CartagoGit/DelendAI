---
id: f00167
title: "quality_policy: interfaz unificada de políticas de calidad"
kind: feat
status: done
type: proposal
track: product
date: 2026-08-24
shipped-in:
  - c9ae5113 # fix(f00167): dividir quality-policy.service (SRP) — extrae resumen de types
  - 412dc69f # chore(proposals): f00167 → review
  - c72958e7 # feat(f00167): plugin quality-policy — interfaz unificada de políticas de calidad
---

# f00167 — quality_policy: interfaz unificada de políticas de calidad

## Goal

Crear `quality_policy`: una interfaz unificada que responde de forma coherente por tests, conventions, lint, types y coverage, unificando conceptualmente quality, rules, test-policy, test-convention y conventions.

Parte del plan `q00003`. Referencia legada: §23 IDEA-005 de `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`.

Salida objetivo:

```json
{
  "tests": { ... },
  "conventions": { ... },
  "lint": { ... },
  "types": { ... },
  "coverage": { ... }
}
```

La ejecución sigue delegando internamente a cada plugin; no se fusionan paquetes.

## why

Cinco plugins solapan parcialmente su dominio de "qué reglas aplicar". Una interfaz unificada da una respuesta coherente y evita que el agente consulte cinco fuentes y las combine mal.

## non-goals

- No fusionar los paquetes quality/rules/test-policy/test-convention/conventions.
- No cambiar la semántica de cada plugin subyacente.
- No reemplazar run_quality/apply_rules.

## Slices

- global_gate: type

### S1 — Plugin quality-policy (interfaz unificada)
- **Status**: done
- **Files**: `plugins/quality-policy/src/lib/tools/quality-policy.tool.ts`
- **Gate**: type
- acceptance:
  - "Devuelve tests/conventions/lint/types/coverage en una sola respuesta."
  - "Delega internamente a quality/rules/test-policy/test-convention/conventions."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde (incluye fix SRP previo del propio autor de la propuesta).
### S2 — Wiring del plugin
- **Status**: done
- **Files**: `plugins/quality-policy/src/index.ts`
- **Gate**: type
- acceptance:
  - "dependsOn los cinco plugins; tests de agregación."

## acceptance

- Devuelve tests/conventions/lint/types/coverage en una sola respuesta.
- Delega internamente a quality/rules/test-policy/test-convention/conventions.
- dependsOn los cinco plugins; tests de agregación.
