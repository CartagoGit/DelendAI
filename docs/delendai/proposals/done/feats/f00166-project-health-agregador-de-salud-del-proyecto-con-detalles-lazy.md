---
id: f00166
title: "project_health: agregador de salud del proyecto con detalles lazy"
kind: feat
status: done
type: proposal
track: product
date: 2026-08-24
shipped-in:
  - 209b9703 # fix(f00166): dividir project-health.service (SRP) — oversized-file 420→252 LOC
  - 74c93922 # chore(proposals): f00166 → review
  - 1b7f7b55 # feat(f00166): plugin project-health — agregador de salud con detalles lazy
---

# f00166 — project_health: agregador de salud del proyecto con detalles lazy

## Goal

Crear `project_health`: un agregador que devuelve primero un resumen compacto (score global + security/deps/quality/debt + próximos pasos) y deja los detalles lazy.

Parte del plan `q00003`. Referencia legada: §23 IDEA-004 de `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`.

Salida objetivo:

```json
{
  "score": 82,
  "security": 93,
  "deps": 78,
  "quality": 81,
  "debt": 74,
  "next": [{ "tool": "...", "reason": "..." }]
}
```

Orquesta quality, security, deps, tech-debt y tests; los detalles se cargan bajo demanda. Mucho más eficiente que obligar al agente a consultar cuatro dominios por separado.

## why

Obligar al agente a consultar security, deps, quality y debt por separado cuesta 4× llamadas y tokens para llegar a la misma conclusión. Un agregador con resumen primero y detalles lazy es más rápido y barato.

## non-goals

- No fusionar los plugins subyacentes (solo agrega).
- No ejecutar escaneos pesados en el resumen (lazy details).
- No sustituir los reportes individuales de cada dominio.

## Slices

- global_gate: type

### S1 — Plugin project-health (resumen lazy)
- **Status**: done
- **Files**: `plugins/project-health/src/lib/tools/project-health.tool.ts`
- **Gate**: type
- acceptance:
  - "Resumen compacto con score global + dominios + next actions."
  - "Los detalles se cargan lazy (no se ejecutan escaneos pesados en el resumen)."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde. Nota: cobertura de tests fina (1 spec, 2 tests) — flag de calidad en auditoría fase 2.
### S2 — Wiring del plugin
- **Status**: done
- **Files**: `plugins/project-health/src/index.ts`
- **Gate**: type
- acceptance:
  - "dependsOn quality/security/deps/tech-debt; tests del agregador."

## acceptance

- Resumen compacto con score global + dominios + next actions.
- Los detalles se cargan lazy (no se ejecutan escaneos pesados en el resumen).
- dependsOn quality/security/deps/tech-debt; tests del agregador.
